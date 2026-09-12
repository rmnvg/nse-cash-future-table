import { config } from "./config.js";
import { pool } from "./db/pool.js";
import { fetchSymbolUniverse } from "./db/symbolUniverse.js";
import { buildTokenLookup } from "./db/tokenLookup.js";
import { loadFilteredTicks } from "./market/loadFilteredTicks.js";
import { bucketByTimestamp } from "./market/bucketByTimestamp.js";
import { createMarketSimulator, type MarketSimulator } from "./market/simulator.js";
import { initRowState, updateLeg, daysUntil } from "./market/rowState.js";
import { createWsServer } from "./ws/server.js";

function rssMb(): number {
  return Math.round(process.memoryUsage().rss / 1024 / 1024);
}

function since(start: number): string {
  return `${((performance.now() - start) / 1000).toFixed(1)}s`;
}

async function main() {
  const bootStart = performance.now();
  console.log("Starting nse-cash-future-table backend...");

  const universe = await fetchSymbolUniverse().catch((err: NodeJS.ErrnoException) => {
    if (err.code === "ECONNREFUSED") {
      console.error(
        `Cannot reach PostgreSQL at ${config.databaseUrl}\n` +
          "Start it with `docker compose up -d` from the repo root, then retry.",
      );
      process.exit(1);
    }
    throw err;
  });

  if (universe.length === 0) {
    console.error(
      "Symbol universe is empty — no stocks with both a cash and FUTSTK contract were found.\n" +
        "Run `npm run ingest:contracts` first, then restart.",
    );
    await pool.end();
    process.exit(1);
  }
  console.log(`Symbol universe: ${universe.length} stocks`);

  const tokenLookup = buildTokenLookup(universe);
  const allowedTokens = new Set(tokenLookup.keys());
  initRowState(
    universe.map((entry) => {
      const expiryIso = entry.foExpiry.toISOString();
      return {
        symbol: entry.symbol,
        futureContractName: entry.foContractName,
        futureExpiry: expiryIso,
        lotSize: entry.foLotSize,
        daysToExpiry: daysUntil(expiryIso),
      };
    }),
  );

  const cmStart = performance.now();
  console.log("Loading + filtering CM market data...");
  const cmRows = await loadFilteredTicks(
    config.cmMarketDataFile,
    allowedTokens,
    config.nseEpochOffsetSec,
  );
  const cmBuckets = bucketByTimestamp(cmRows);
  console.log(
    `CM: ${cmRows.length.toLocaleString()} rows -> ${cmBuckets.length.toLocaleString()} buckets in ${since(cmStart)} (rss ${rssMb()}MB)`,
  );

  const foStart = performance.now();
  console.log("Loading + filtering FO market data...");
  const foRows = await loadFilteredTicks(
    config.foMarketDataFile,
    allowedTokens,
    config.nseEpochOffsetSec,
  );
  const foBuckets = bucketByTimestamp(foRows);
  console.log(
    `FO: ${foRows.length.toLocaleString()} rows -> ${foBuckets.length.toLocaleString()} buckets in ${since(foStart)} (rss ${rssMb()}MB)`,
  );

  const { broadcastUpdate, close: closeWsServer } = createWsServer(config.port);

  function applyTicks(changedTokens: number[], simulator: MarketSimulator): Set<string> {
    const touchedSymbols = new Set<string>();
    for (const token of changedTokens) {
      const lookup = tokenLookup.get(token);
      if (!lookup) continue;
      const tick = simulator.getLatestTick(token);
      if (!tick) continue;
      updateLeg(lookup.symbol, lookup.leg, tick);
      touchedSymbols.add(lookup.symbol);
    }
    return touchedSymbols;
  }

  const cmSimulator = createMarketSimulator(cmBuckets, config.tickIntervalMs, (changedTokens) => {
    broadcastUpdate(applyTicks(changedTokens, cmSimulator));
  });
  const foSimulator = createMarketSimulator(foBuckets, config.tickIntervalMs, (changedTokens) => {
    broadcastUpdate(applyTicks(changedTokens, foSimulator));
  });

  cmSimulator.start();
  foSimulator.start();

  console.log(`Ready in ${since(bootStart)} (rss ${rssMb()}MB)`);
  console.log(`listening on ws://localhost:${config.port}`);

  process.on("SIGINT", () => {
    console.log("\nShutting down...");
    cmSimulator.stop();
    foSimulator.stop();
    closeWsServer()
      .then(() => pool.end())
      .then(() => process.exit(0));
  });
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
