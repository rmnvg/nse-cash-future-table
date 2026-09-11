import { describe, it, expect } from "vitest";
import { buildTokenLookup } from "./tokenLookup.js";

const universe = [
  { symbol: "RELIANCE", cmToken: 2885, foToken: 68777 },
  { symbol: "TCS", cmToken: 11536, foToken: 68815 },
];

describe("buildTokenLookup", () => {
  it("maps both legs of every symbol to one entry each", () => {
    const lookup = buildTokenLookup(universe);

    expect(lookup.size).toBe(4);
    expect(lookup.get(2885)).toEqual({ symbol: "RELIANCE", leg: "cash" });
    expect(lookup.get(68777)).toEqual({ symbol: "RELIANCE", leg: "future" });
    expect(lookup.get(11536)).toEqual({ symbol: "TCS", leg: "cash" });
    expect(lookup.get(68815)).toEqual({ symbol: "TCS", leg: "future" });
  });

  it("returns undefined for tokens outside the universe, so ticks can be skipped", () => {
    expect(buildTokenLookup(universe).get(99999)).toBeUndefined();
  });

  it("handles an empty universe", () => {
    expect(buildTokenLookup([]).size).toBe(0);
  });
});
