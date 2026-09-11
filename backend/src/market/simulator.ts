import type { TickBucket } from "./bucketByTimestamp.js";

export interface LatestTick {
  bid: number;
  ask: number;
  ltp: number;
}

export type OnTickCallback = (changedTokens: number[]) => void;

export interface MarketSimulator {
  start(): void;
  stop(): void;
  getLatestTick(token: number): LatestTick | undefined;
}

export function createMarketSimulator(
  buckets: TickBucket[],
  tickIntervalMs: number,
  onTick: OnTickCallback,
): MarketSimulator {
  const latestTicks = new Map<number, LatestTick>();
  let pointer = 0;
  let timer: NodeJS.Timeout | null = null;

  function advance(): void {
    if (buckets.length === 0) return;

    const bucket = buckets[pointer];
    const changedTokens: number[] = [];

    for (const row of bucket.rows) {
      latestTicks.set(row.token, {
        bid: row.bid / 100,
        ask: row.ask / 100,
        ltp: row.ltp / 100,
      });
      changedTokens.push(row.token);
    }

    pointer = (pointer + 1) % buckets.length;
    onTick(changedTokens);
  }

  return {
    start() {
      if (timer) return;
      timer = setInterval(advance, tickIntervalMs);
    },
    stop() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    },
    getLatestTick(token: number) {
      return latestTicks.get(token);
    },
  };
}
