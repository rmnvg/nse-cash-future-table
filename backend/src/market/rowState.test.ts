import { describe, it, beforeEach, expect } from "vitest";
import {
  initRowState,
  updateLeg,
  computeRow,
  getAllSymbols,
  daysUntil,
  type SymbolMeta,
} from "./rowState.js";

const RELIANCE: SymbolMeta = {
  symbol: "RELIANCE",
  futureContractName: "RELIANCE26SEPFUT",
  futureExpiry: "2026-09-29T09:00:00.000Z",
  lotSize: 500,
  daysToExpiry: 25,
};
const TCS: SymbolMeta = {
  symbol: "TCS",
  futureContractName: "TCS26SEPFUT",
  futureExpiry: "2026-09-29T09:00:00.000Z",
  lotSize: 225,
  daysToExpiry: 25,
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

describe("basis metrics", () => {
  it("computes basis % from the LTPs of both legs", () => {
    updateLeg("RELIANCE", "cash", { bid: 1300, ask: 1300, ltp: 1300 });
    updateLeg("RELIANCE", "future", { bid: 1313, ask: 1313, ltp: 1313 });

    // (1313 - 1300) / 1300 = 1%
    expect(computeRow("RELIANCE").basisPct).toBe(1);
  });

  it("annualizes the basis over days to expiry", () => {
    updateLeg("RELIANCE", "cash", { bid: 1300, ask: 1300, ltp: 1300 });
    updateLeg("RELIANCE", "future", { bid: 1313, ask: 1313, ltp: 1313 });

    // 1% over 25 days -> 1 * 365/25 = 14.6% annualized
    expect(computeRow("RELIANCE").annualizedBasisPct).toBe(14.6);
  });

  it("makes stocks at different price levels comparable", () => {
    // Cheap stock, small absolute spread.
    updateLeg("TCS", "cash", { bid: 100, ask: 100, ltp: 100 });
    updateLeg("TCS", "future", { bid: 101, ask: 101, ltp: 101 });
    // Expensive stock, large absolute spread, same relative basis.
    updateLeg("RELIANCE", "cash", { bid: 10_000, ask: 10_000, ltp: 10_000 });
    updateLeg("RELIANCE", "future", { bid: 10_100, ask: 10_100, ltp: 10_100 });

    const cheap = computeRow("TCS");
    const pricey = computeRow("RELIANCE");
    expect(cheap.basisPct).toBe(pricey.basisPct);
    expect(cheap.annualizedBasisPct).toBe(pricey.annualizedBasisPct);
  });

  it("reports a negative basis when the future trades below spot (backwardation)", () => {
    updateLeg("TCS", "cash", { bid: 100, ask: 100, ltp: 100 });
    updateLeg("TCS", "future", { bid: 99, ask: 99, ltp: 99 });

    expect(computeRow("TCS").basisPct).toBe(-1);
    expect(computeRow("TCS").annualizedBasisPct).toBeLessThan(0);
  });

  it("leaves basis null until both legs have ticked", () => {
    updateLeg("RELIANCE", "future", { bid: 1313, ask: 1313, ltp: 1313 });
    expect(computeRow("RELIANCE").basisPct).toBeNull();
    expect(computeRow("RELIANCE").annualizedBasisPct).toBeNull();
  });

  it("does not divide by zero if spot is 0", () => {
    updateLeg("TCS", "cash", { bid: 0, ask: 0, ltp: 0 });
    updateLeg("TCS", "future", { bid: 10, ask: 10, ltp: 10 });

    expect(computeRow("TCS").basisPct).toBeNull();
    expect(computeRow("TCS").annualizedBasisPct).toBeNull();
  });
});

describe("lot sizing", () => {
  it("scales each spread by the contract's lot size", () => {
    updateLeg("RELIANCE", "cash", { bid: 1345.9, ask: 1317.8, ltp: 1313.1 });
    updateLeg("RELIANCE", "future", { bid: 1331, ask: 1325, ltp: 1319.1 });

    const row = computeRow("RELIANCE");
    // 13.2 x 500, 20.9 x 500
    expect(row.buySpreadPerLot).toBe(6600);
    expect(row.sellSpreadPerLot).toBe(10450);
  });

  it("uses each contract's own lot size", () => {
    updateLeg("TCS", "cash", { bid: 100, ask: 100, ltp: 100 });
    updateLeg("TCS", "future", { bid: 102, ask: 101, ltp: 101 });

    // buySpread = 102 - 100 = 2, lot 225
    expect(computeRow("TCS").buySpreadPerLot).toBe(450);
  });

  it("returns null per-lot values when lot size is unknown", () => {
    initRowState([
      { ...RELIANCE, lotSize: null },
    ]);
    updateLeg("RELIANCE", "cash", { bid: 100, ask: 100, ltp: 100 });
    updateLeg("RELIANCE", "future", { bid: 102, ask: 101, ltp: 101 });

    const row = computeRow("RELIANCE");
    expect(row.buySpread).toBe(2);
    expect(row.buySpreadPerLot).toBeNull();
  });
});

describe("daysUntil", () => {
  const now = Date.parse("2026-09-12T00:00:00.000Z");

  it("counts whole days to expiry", () => {
    expect(daysUntil("2026-09-29T09:00:00.000Z", now)).toBe(18);
  });

  it("returns null for an expiry in the past", () => {
    expect(daysUntil("2026-09-01T09:00:00.000Z", now)).toBeNull();
  });

  it("returns null for an unparseable date", () => {
    expect(daysUntil("not-a-date", now)).toBeNull();
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
