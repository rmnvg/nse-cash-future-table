import { config } from "../config.js";
import { pool } from "./pool.js";

export interface SymbolUniverseEntry {
  symbol: string;
  cmToken: number;
  foToken: number;
  foExpiry: Date;
  foContractName: string;
}

export async function fetchSymbolUniverse(): Promise<SymbolUniverseEntry[]> {
  // The inner join is what enforces "only stocks with both a cash contract
  // and a FUTSTK future"; distinct on (symbol) ... order by expiry_date asc
  // picks each stock's nearest expiry.
  const testSymbolFilter = config.excludeTestSymbols
    ? "where symbol not like '%NSETEST%'"
    : "";

  const result = await pool.query(`
    select cm.symbol, cm.token as cm_token, fo.token as fo_token,
           fo.expiry_date as fo_expiry, fo.contract_name as fo_contract_name
    from (
      select distinct on (symbol) symbol, token, expiry_date, contract_name
      from fo_contracts
      ${testSymbolFilter}
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
    foContractName: row.fo_contract_name,
  }));
}

