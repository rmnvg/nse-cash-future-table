import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createMarketSimulator } from "./simulator.js";
import type { TickBucket } from "./bucketByTimestamp.js";

function bucket(timestampSec: number, token: number, paise: number): TickBucket {
  return {
    timestampSec,
    rows: [{ token, timestampSec, bid: paise, ask: paise + 10, ltp: paise }],
  };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("createMarketSimulator", () => {
  it("holds no ticks until started", () => {
    const sim = createMarketSimulator([bucket(1, 2885, 132650)], 1000, () => {});
    expect(sim.getLatestTick(2885)).toBeUndefined();
  });

  it("converts paise to rupees when applying a bucket", () => {
    const sim = createMarketSimulator([bucket(1, 2885, 132650)], 1000, () => {});
    sim.start();
    vi.advanceTimersByTime(1000);

    expect(sim.getLatestTick(2885)).toEqual({
      bid: 1326.5,
      ask: 1326.6,
      ltp: 1326.5,
    });
    sim.stop();
  });

  it("reports the tokens changed on each tick", () => {
    const onTick = vi.fn();
    const sim = createMarketSimulator(
      [bucket(1, 2885, 100), bucket(2, 68777, 200)],
      1000,
      onTick,
    );
    sim.start();

    vi.advanceTimersByTime(1000);
    expect(onTick).toHaveBeenLastCalledWith([2885]);

    vi.advanceTimersByTime(1000);
    expect(onTick).toHaveBeenLastCalledWith([68777]);

    sim.stop();
  });

  it("wraps back to the first bucket after the last one (loop-back replay)", () => {
    const sim = createMarketSimulator(
      [bucket(1, 2885, 100), bucket(2, 2885, 200)],
      1000,
      () => {},
    );
    sim.start();

    vi.advanceTimersByTime(1000);
    expect(sim.getLatestTick(2885)?.ltp).toBe(1);

    vi.advanceTimersByTime(1000);
    expect(sim.getLatestTick(2885)?.ltp).toBe(2);

    // Third tick must wrap to bucket 0, not run off the end.
    vi.advanceTimersByTime(1000);
    expect(sim.getLatestTick(2885)?.ltp).toBe(1);

    sim.stop();
  });

  it("never emits NaN/undefined across a full wrap cycle", () => {
    const onTick = vi.fn();
    const sim = createMarketSimulator(
      [bucket(1, 2885, 100), bucket(2, 2885, 200)],
      1000,
      onTick,
    );
    sim.start();
    vi.advanceTimersByTime(10_000);

    for (const [tokens] of onTick.mock.calls) {
      expect(tokens).toEqual([2885]);
    }
    const tick = sim.getLatestTick(2885)!;
    expect(Number.isFinite(tick.bid)).toBe(true);
    expect(Number.isFinite(tick.ask)).toBe(true);
    expect(Number.isFinite(tick.ltp)).toBe(true);

    sim.stop();
  });

  it("stops advancing once stopped and is safe to start twice", () => {
    const onTick = vi.fn();
    const sim = createMarketSimulator([bucket(1, 2885, 100)], 1000, onTick);

    sim.start();
    sim.start(); // must not register a second interval
    vi.advanceTimersByTime(1000);
    expect(onTick).toHaveBeenCalledTimes(1);

    sim.stop();
    vi.advanceTimersByTime(5000);
    expect(onTick).toHaveBeenCalledTimes(1);
  });

  it("does nothing when there are no buckets", () => {
    const onTick = vi.fn();
    const sim = createMarketSimulator([], 1000, onTick);
    sim.start();
    vi.advanceTimersByTime(5000);

    expect(onTick).not.toHaveBeenCalled();
    sim.stop();
  });
});
