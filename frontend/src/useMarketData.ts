import { useEffect, useRef, useState } from "react";
// The backend owns the wire contract; importing the type (erased at build
// time) keeps the two sides from drifting apart silently.
import type { ComputedRow } from "../../backend/src/market/rowState";

export type Row = ComputedRow;

interface SnapshotMessage {
  type: "snapshot";
  rows: Row[];
}

interface UpdateMessage {
  type: "update";
  rows: Row[];
}

type ServerMessage = SnapshotMessage | UpdateMessage;

export type ConnectionStatus = "connecting" | "connected" | "reconnecting";

const INITIAL_RETRY_DELAY_MS = 500;
const MAX_RETRY_DELAY_MS = 10_000;

/**
 * Connects to the market data WebSocket.
 *
 * The initial 'snapshot' becomes React state (one render). Every 'update'
 * after that bypasses React state entirely and is handed straight to
 * `onUpdate`, so the caller can apply it as an AG Grid transaction instead
 * of re-rendering all rows every tick.
 */
export function useMarketData(url: string, onUpdate: (rows: Row[]) => void) {
  const [snapshot, setSnapshot] = useState<Row[] | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  useEffect(() => {
    let cancelled = false;
    let ws: WebSocket | null = null;
    let retryDelay = INITIAL_RETRY_DELAY_MS;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    // Updates arrive ~1/sec; throttle the "last update" clock to match
    // rather than re-rendering the header on every message.
    let lastClockTick = 0;

    function connect() {
      if (cancelled) return;

      ws = new WebSocket(url);

      ws.onopen = () => {
        retryDelay = INITIAL_RETRY_DELAY_MS;
        setStatus("connected");
      };

      ws.onmessage = (event) => {
        const message: ServerMessage = JSON.parse(event.data as string);
        if (message.type === "snapshot") {
          setSnapshot(message.rows);
        } else if (message.type === "update") {
          onUpdateRef.current(message.rows);
          const now = Date.now();
          if (now - lastClockTick >= 1000) {
            lastClockTick = now;
            setLastUpdate(new Date(now));
          }
        }
      };

      ws.onclose = () => {
        if (cancelled) return;
        setStatus("reconnecting");
        retryTimer = setTimeout(connect, retryDelay);
        retryDelay = Math.min(retryDelay * 2, MAX_RETRY_DELAY_MS);
      };

      ws.onerror = () => {
        ws?.close();
      };
    }

    connect();

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      ws?.close();
    };
  }, [url]);

  return { snapshot, status, lastUpdate };
}
