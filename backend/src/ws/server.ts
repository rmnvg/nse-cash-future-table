import { createServer, type Server } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { computeRow, getAllSymbols } from "../market/rowState.js";

export interface WsServerHandle {
  wss: WebSocketServer;
  /** Resolves once the socket is actually accepting connections. */
  ready: Promise<void>;
  broadcastUpdate(symbols: Set<string>): void;
  clientCount(): number;
  close(): Promise<void>;
}

/** Port is injected rather than read from config so this is testable standalone. */
export function createWsServer(port: number): WsServerHandle {
  const clients = new Set<WebSocket>();
  const startedAt = Date.now();

  // A plain HTTP server hosts the upgrade, which also gives us somewhere to
  // answer `GET /health` — handy for checking the backend without a WS client.
  const http: Server = createServer((req, res) => {
    if (req.url === "/health") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          status: "ok",
          symbols: getAllSymbols().length,
          clients: clients.size,
          uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
        }),
      );
      return;
    }
    res.writeHead(404).end();
  });

  const wss = new WebSocketServer({ server: http });

  wss.on("connection", (ws) => {
    clients.add(ws);

    ws.send(
      JSON.stringify({
        type: "snapshot",
        rows: getAllSymbols().map((symbol) => computeRow(symbol)),
      }),
    );

    ws.on("close", () => {
      clients.delete(ws);
    });
  });

  const ready = new Promise<void>((resolve) => http.listen(port, resolve));

  function broadcastUpdate(symbols: Set<string>): void {
    if (symbols.size === 0) return;

    const message = JSON.stringify({
      type: "update",
      rows: Array.from(symbols).map((symbol) => computeRow(symbol)),
    });

    for (const client of clients) {
      if (client.readyState !== WebSocket.OPEN) continue;
      try {
        client.send(message);
      } catch {
        // Socket closed mid-broadcast; it'll be removed via the 'close' handler.
      }
    }
  }

  function close(): Promise<void> {
    // wss.close() waits for open sockets, so drop them first — otherwise a
    // still-connected browser would stall shutdown indefinitely.
    for (const client of clients) client.terminate();
    clients.clear();
    return new Promise((resolve) => {
      wss.close(() => http.close(() => resolve()));
    });
  }

  return { wss, ready, broadcastUpdate, clientCount: () => clients.size, close };
}
