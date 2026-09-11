export type Leg = "cash" | "future";

export interface TokenLookupEntry {
  symbol: string;
  leg: Leg;
}

/** Minimal shape needed to build the lookup — SymbolUniverseEntry satisfies it. */
export interface TokenPair {
  symbol: string;
  cmToken: number;
  foToken: number;
}

/**
 * Maps every cash and future token to its symbol and leg, so an incoming
 * tick can be routed in O(1) without touching Postgres.
 */
export function buildTokenLookup(
  universe: TokenPair[],
): Map<number, TokenLookupEntry> {
  const lookup = new Map<number, TokenLookupEntry>();
  for (const entry of universe) {
    lookup.set(entry.cmToken, { symbol: entry.symbol, leg: "cash" });
    lookup.set(entry.foToken, { symbol: entry.symbol, leg: "future" });
  }
  return lookup;
}
