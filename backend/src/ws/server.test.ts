import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { WebSocket } from "ws";
import { createWsServer, type WsServerHandle } from "./server.js";
import { initRowState, updateLeg, type SymbolMeta } from "../market/rowState.js";
import { createMarketSimulator } from "../market/simulator.js";
import type { TickBucket } from "../market/bucketByTimestamp.js";
import { buildTokenLookup } from "../db/tokenLookup.js";

// Exercises the real WebSocket server against the real row state, driven by
// a stub simulator — no Postgres and no CSV files involved.

const PORT = 8099;
const WS_URL = `ws://localhost:${PORT}`;

const SYMBOLS: SymbolMeta[] = [
  {
    symbol: "RELIANCE",
    futureContractName: "RELIANCE26SEPFUT",
    futureExpiry: "2026-09-29T09:00:00.000Z",
    lotSize: 500,
    daysToExpiry: 25,
  },
  {
    symbol: "TCS",
    futureContractName: "TCS26SEPFUT",
    futureExpiry: "2026-09-29T09:00:00.000Z",
    lotSize: 225,
    daysToExpiry: 25,
  },
];

interface TestClient {
  socket: WebSocket;
  /** Resolves with the next message, buffering any that arrive early. */
  next(): Promise<any>;
  received: number;
}

/**
 * The snapshot is sent the moment the server sees the connection, which can
 * beat a listener attached after 'open' — so buffer from construction.
 */
async function connect(): Promise<TestClient> {
  const socket = new WebSocket(WS_URL);
  const buffered: any[] = [];
  const waiting: ((msg: any) => void)[] = [];
  const client: TestClient = {
    socket,
    received: 0,
    next: () =>
      buffered.length > 0
        ? Promise.resolve(buffered.shift())
        : new Promise((resolve) => waiting.push(resolve)),
  };

  socket.on("message", (data) => {
    client.received += 1;
    const msg = JSON.parse(data.toString());
    const waiter = waiting.shift();
    if (waiter) waiter(msg);
    else buffered.push(msg);
  });

  await new Promise<void>((resolve, reject) => {
    socket.once("open", () => resolve());
    socket.once("error", reject);
  });

  return client;
}

const settle = () => new Promise((r) => setTimeout(r, 50));

let server: WsServerHandle;

beforeEach(async () => {
  initRowState(SYMBOLS);
  server = createWsServer(PORT);
  await new Promise<void>((resolve) => server.wss.once("listening", () => resolve()));
});

afterEach(async () => {
  await server.close();
});

describe("WebSocket server", () => {
  it("sends a snapshot of every symbol as soon as a client connects", async () => {
    const client = await connect();
    const msg = await client.next();

    expect(msg.type).toBe("snapshot");
    expect(msg.rows.map((r: any) => r.symbol).sort()).toEqual(["RELIANCE", "TCS"]);
  });

  it("snapshots before any tick arrives, with nulls rather than an empty table", async () => {
    const client = await connect();
    const msg = await client.next();

    expect(msg.rows).toHaveLength(2);
    for (const row of msg.rows) {
      expect(row.stockLtp).toBeNull();
      expect(row.futureLtp).toBeNull();
      expect(row.buySpread).toBeNull();
      expect(row.sellSpread).toBeNull();
    }
  });

  it("includes static contract metadata in the snapshot", async () => {
    const client = await connect();
    const reliance = (await client.next()).rows.find(
      (r: any) => r.symbol === "RELIANCE",
    );

    expect(reliance.futureContractName).toBe("RELIANCE26SEPFUT");
    expect(reliance.lotSize).toBe(500);
    expect(reliance.daysToExpiry).toBe(25);
  });

  it("broadcasts only the symbols that changed", async () => {
    const client = await connect();
    await client.next();

    updateLeg("RELIANCE", "cash", { bid: 1345.9, ask: 1317.8, ltp: 1313.1 });
    server.broadcastUpdate(new Set(["RELIANCE"]));

    const msg = await client.next();
    expect(msg.type).toBe("update");
    expect(msg.rows).toHaveLength(1);
    expect(msg.rows[0].symbol).toBe("RELIANCE");
    expect(msg.rows[0].stockLtp).toBe(1313.1);
  });

  it("sends computed spreads once both legs have ticked", async () => {
    const client = await connect();
    await client.next();

    updateLeg("RELIANCE", "cash", { bid: 1345.9, ask: 1317.8, ltp: 1313.1 });
    updateLeg("RELIANCE", "future", { bid: 1331, ask: 1325, ltp: 1319.1 });
    server.broadcastUpdate(new Set(["RELIANCE"]));

    const row = (await client.next()).rows[0];
    expect(row.buySpread).toBe(13.2);
    expect(row.sellSpread).toBe(20.9);
    expect(row.buySpreadPerLot).toBe(6600);
  });

  it("fans out the same update to every connected client", async () => {
    const [a, b] = await Promise.all([connect(), connect()]);
    await Promise.all([a.next(), b.next()]);

    updateLeg("TCS", "future", { bid: 10, ask: 20, ltp: 30 });
    server.broadcastUpdate(new Set(["TCS"]));

    const [msgA, msgB] = await Promise.all([a.next(), b.next()]);
    expect(msgA.rows[0].futureLtp).toBe(30);
    expect(msgB.rows[0].futureLtp).toBe(30);
  });

  it("does not broadcast when nothing changed in a tick", async () => {
    const client = await connect();
    await client.next();
    const afterSnapshot = client.received;

    server.broadcastUpdate(new Set());
    await settle();

    expect(client.received).toBe(afterSnapshot);
  });

  it("keeps broadcasting after a client disconnects mid-stream", async () => {
    const [a, b] = await Promise.all([connect(), connect()]);
    await Promise.all([a.next(), b.next()]);

    a.socket.close();
    await settle();

    updateLeg("TCS", "cash", { bid: 1, ask: 2, ltp: 3 });
    expect(() => server.broadcastUpdate(new Set(["TCS"]))).not.toThrow();

    expect((await b.next()).rows[0].stockLtp).toBe(3);
  });

  it("routes simulator ticks through the token lookup to the right leg", async () => {
    const lookup = buildTokenLookup([
      { symbol: "RELIANCE", cmToken: 2885, foToken: 68777 },
    ]);
    const buckets: TickBucket[] = [
      {
        timestampSec: 1,
        rows: [
          { token: 2885, timestampSec: 1, bid: 130_000, ask: 131_000, ltp: 130_500 },
          { token: 68777, timestampSec: 1, bid: 132_000, ask: 133_000, ltp: 132_500 },
        ],
      },
    ];

    const client = await connect();
    await client.next();

    const sim = createMarketSimulator(buckets, 10, (changed) => {
      const touched = new Set<string>();
      for (const token of changed) {
        const entry = lookup.get(token);
        const tick = sim.getLatestTick(token);
        if (!entry || !tick) continue;
        updateLeg(entry.symbol, entry.leg, tick);
        touched.add(entry.symbol);
      }
      server.broadcastUpdate(touched);
    });
    sim.start();

    const row = (await client.next()).rows[0];
    sim.stop();

    expect(row.symbol).toBe("RELIANCE");
    expect(row.stockLtp).toBe(1305); // 130500 paise -> rupees
    expect(row.futureLtp).toBe(1325);
    expect(row.buySpread).toBe(10); // futureBid 1320 - stockAsk 1310
  });
});
