import { describe, it, expect } from "vitest";
import { parseMarketDataLine } from "./parseMarketData.js";

describe("parseMarketDataLine", () => {
  it("parses a comma-delimited tick (market data files differ from contract files)", () => {
    expect(parseMarketDataLine("2885,1472986477,132650,132660,132650")).toEqual({
      token: 2885,
      timestampRaw: 1472986477,
      bid: 132650,
      ask: 132660,
      ltp: 132650,
    });
  });

  it("keeps prices in raw paise — conversion to rupees happens in the simulator", () => {
    const { bid } = parseMarketDataLine("2885,1472986477,132650,132660,132650");
    expect(bid).toBe(132650);
    expect(bid / 100).toBe(1326.5);
  });

  it("handles zero bid/ask rows, which appear throughout the FO file", () => {
    expect(parseMarketDataLine("68407,1472893200,0,0,2399480")).toEqual({
      token: 68407,
      timestampRaw: 1472893200,
      bid: 0,
      ask: 0,
      ltp: 2399480,
    });
  });
});
