import { describe, it, expect } from "vitest";
import { bucketByTimestamp } from "./bucketByTimestamp.js";
import type { TickRow } from "./loadFilteredTicks.js";

function row(token: number, timestampSec: number): TickRow {
  return { token, timestampSec, bid: 100, ask: 101, ltp: 100 };
}

describe("bucketByTimestamp", () => {
  it("groups rows sharing a timestamp into one bucket", () => {
    const buckets = bucketByTimestamp([
      row(1, 1000),
      row(2, 1000),
      row(3, 1001),
    ]);

    expect(buckets).toHaveLength(2);
    expect(buckets[0].timestampSec).toBe(1000);
    expect(buckets[0].rows.map((r) => r.token)).toEqual([1, 2]);
    expect(buckets[1].rows.map((r) => r.token)).toEqual([3]);
  });

  it("preserves ascending timestamp order", () => {
    const buckets = bucketByTimestamp([row(1, 10), row(2, 20), row(3, 30)]);
    expect(buckets.map((b) => b.timestampSec)).toEqual([10, 20, 30]);
  });

  it("returns no buckets for no rows", () => {
    expect(bucketByTimestamp([])).toEqual([]);
  });

  it("does not merge non-adjacent rows with the same timestamp", () => {
    // Input is always pre-sorted; this documents the streaming assumption.
    const buckets = bucketByTimestamp([row(1, 10), row(2, 20), row(3, 10)]);
    expect(buckets).toHaveLength(3);
  });
});
