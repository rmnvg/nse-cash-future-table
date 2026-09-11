import { WebSocketServer, WebSocket } from "ws";
import { computeRow, getAllSymbols } from "../market/rowState.js";

export interface WsServerHandle {
  wss: WebSocketServer;
  broadcastUpdate(symbols: Set<string>): void;
  close(): Promise<void>;
}

/** Port is injected rather than read from config so this is testable standalone. */
export function createWsServer(port: number): WsServerHandle {
  const wss = new WebSocketServer({ port });
  const clients = new Set<WebSocket>();

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
    return new Promise((resolve) => wss.close(() => resolve()));
  }

  return { wss, broadcastUpdate, close };
}
