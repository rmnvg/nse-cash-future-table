import { pool } from "./pool.js";

export interface SymbolUniverseEntry {
  symbol: string;
  cmToken: number;
  foToken: number;
  foExpiry: Date;
}

export type Leg = "cash" | "future";

export interface TokenLookupEntry {
  symbol: string;
  leg: Leg;
}

export async function fetchSymbolUniverse(): Promise<SymbolUniverseEntry[]> {
  const result = await pool.query(`
    select cm.symbol, cm.token as cm_token, fo.token as fo_token,
           fo.expiry_date as fo_expiry
    from (
      select distinct on (symbol) symbol, token, expiry_date
      from fo_contracts
      order by symbol, expiry_date asc
    ) fo
    inner join cm_contracts cm on cm.symbol = fo.symbol
    order by cm.symbol asc;
  `);

  return result.rows.map((row) => ({
    symbol: row.symbol,
    cmToken: row.cm_token,
    foToken: row.fo_token,
    foExpiry: row.fo_expiry,
  }));
}

export function buildTokenLookup(
  universe: SymbolUniverseEntry[],
): Map<number, TokenLookupEntry> {
  const lookup = new Map<number, TokenLookupEntry>();
  for (const entry of universe) {
    lookup.set(entry.cmToken, { symbol: entry.symbol, leg: "cash" });
    lookup.set(entry.foToken, { symbol: entry.symbol, leg: "future" });
  }
  return lookup;
}
