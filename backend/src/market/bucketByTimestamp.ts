import type { TickRow } from "./loadFilteredTicks.js";

export interface TickBucket {
  timestampSec: number;
  rows: TickRow[];
}

// Assumes `rows` is already sorted by timestampSec ascending
// (loadFilteredTicks guarantees this).
export function bucketByTimestamp(rows: TickRow[]): TickBucket[] {
  const buckets: TickBucket[] = [];
  let current: TickBucket | undefined;

  for (const row of rows) {
    if (!current || current.timestampSec !== row.timestampSec) {
      current = { timestampSec: row.timestampSec, rows: [] };
      buckets.push(current);
    }
    current.rows.push(row);
  }

  return buckets;
}
