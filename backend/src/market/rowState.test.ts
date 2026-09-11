import { describe, it, beforeEach, expect } from "vitest";
import {
  initRowState,
  updateLeg,
  computeRow,
  getAllSymbols,
  type SymbolMeta,
} from "./rowState.js";

const RELIANCE: SymbolMeta = {
  symbol: "RELIANCE",
  futureContractName: "RELIANCE26SEPFUT",
  futureExpiry: "2026-09-29T09:00:00.000Z",
};
const TCS: SymbolMeta = {
  symbol: "TCS",
  futureContractName: "TCS26SEPFUT",
  futureExpiry: "2026-09-29T09:00:00.000Z",
};

beforeEach(() => {
  initRowState([RELIANCE, TCS]);
});

describe("initRowState", () => {
  it("creates one row per symbol with every price null", () => {
    expect(getAllSymbols()).toEqual(["RELIANCE", "TCS"]);

    const row = computeRow("RELIANCE");
    expect(row.stockLtp).toBeNull();
    expect(row.futureLtp).toBeNull();
    expect(row.buySpread).toBeNull();
    expect(row.sellSpread).toBeNull();
  });

  it("carries static contract metadata so the grid can show the chosen future", () => {
    expect(computeRow("RELIANCE").futureContractName).toBe("RELIANCE26SEPFUT");
    expect(computeRow("RELIANCE").futureExpiry).toBe("2026-09-29T09:00:00.000Z");
  });
});

describe("spread calculation", () => {
  // Real values captured from a running replay and verified by hand.
  it("computes Buy Spread = Future Bid - Stock Ask", () => {
    updateLeg("RELIANCE", "cash", { bid: 1345.9, ask: 1317.8, ltp: 1313.1 });
    updateLeg("RELIANCE", "future", { bid: 1331, ask: 1325, ltp: 1319.1 });

    expect(computeRow("RELIANCE").buySpread).toBe(13.2);
  });

  it("computes Sell Spread = Stock Bid - Future Ask", () => {
    updateLeg("RELIANCE", "cash", { bid: 1345.9, ask: 1317.8, ltp: 1313.1 });
    updateLeg("RELIANCE", "future", { bid: 1331, ask: 1325, ltp: 1319.1 });

    expect(computeRow("RELIANCE").sellSpread).toBe(20.9);
  });

  it("produces negative spreads when the future is bid below the cash offer", () => {
    updateLeg("TCS", "cash", { bid: 2465.4, ask: 2347, ltp: 2348 });
    updateLeg("TCS", "future", { bid: 2346.3, ask: 2349.9, ltp: 2346.3 });

    const row = computeRow("TCS");
    expect(row.buySpread).toBe(-0.7);
    expect(row.sellSpread).toBe(115.5);
  });

  it("rounds to 2 decimals rather than leaking float noise", () => {
    updateLeg("TCS", "cash", { bid: 0.3, ask: 0.1, ltp: 0.2 });
    updateLeg("TCS", "future", { bid: 0.2, ask: 0.1, ltp: 0.2 });

    // 0.2 - 0.1 === 0.1 only after rounding
    expect(computeRow("TCS").buySpread).toBe(0.1);
    expect(computeRow("TCS").sellSpread).toBe(0.2);
  });
});

describe("partial legs", () => {
  it("leaves both spreads null when only the cash leg has ticked", () => {
    updateLeg("RELIANCE", "cash", { bid: 1345.9, ask: 1317.8, ltp: 1313.1 });

    const row = computeRow("RELIANCE");
    expect(row.stockLtp).toBe(1313.1);
    expect(row.futureLtp).toBeNull();
    expect(row.buySpread).toBeNull();
    expect(row.sellSpread).toBeNull();
  });

  it("leaves both spreads null when only the future leg has ticked", () => {
    updateLeg("RELIANCE", "future", { bid: 1331, ask: 1325, ltp: 1319.1 });

    const row = computeRow("RELIANCE");
    expect(row.futureLtp).toBe(1319.1);
    expect(row.buySpread).toBeNull();
    expect(row.sellSpread).toBeNull();
  });

  it("never returns NaN for a missing leg", () => {
    updateLeg("RELIANCE", "cash", { bid: 1345.9, ask: 1317.8, ltp: 1313.1 });

    const row = computeRow("RELIANCE");
    expect(Number.isNaN(row.buySpread as number)).toBe(false);
    expect(Number.isNaN(row.sellSpread as number)).toBe(false);
  });
});

describe("wire payload", () => {
  it("includes bid/ask/ltp for both legs, as the brief requires", () => {
    updateLeg("RELIANCE", "cash", { bid: 1345.9, ask: 1317.8, ltp: 1313.1 });
    updateLeg("RELIANCE", "future", { bid: 1331, ask: 1325, ltp: 1319.1 });

    expect(computeRow("RELIANCE")).toMatchObject({
      symbol: "RELIANCE",
      stockBid: 1345.9,
      stockAsk: 1317.8,
      stockLtp: 1313.1,
      futureBid: 1331,
      futureAsk: 1325,
      futureLtp: 1319.1,
    });
  });
});

describe("updateLeg", () => {
  it("ignores ticks for symbols outside the universe", () => {
    expect(() =>
      updateLeg("NOT_A_SYMBOL", "cash", { bid: 1, ask: 2, ltp: 3 }),
    ).not.toThrow();
    expect(getAllSymbols()).toEqual(["RELIANCE", "TCS"]);
  });

  it("overwrites the previous tick for that leg only", () => {
    updateLeg("RELIANCE", "cash", { bid: 1, ask: 2, ltp: 3 });
    updateLeg("RELIANCE", "future", { bid: 10, ask: 20, ltp: 30 });
    updateLeg("RELIANCE", "cash", { bid: 4, ask: 5, ltp: 6 });

    const row = computeRow("RELIANCE");
    expect(row.stockLtp).toBe(6);
    expect(row.futureLtp).toBe(30);
  });
});
