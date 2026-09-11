import { readLines } from "../ingest/lineReader.js";
import { parseMarketDataLine } from "./parseMarketData.js";

export interface TickRow {
  token: number;
  timestampSec: number; // epoch-corrected (Unix seconds, UTC)
  bid: number; // raw paise
  ask: number; // raw paise
  ltp: number; // raw paise
}

export async function loadFilteredTicks(
  filePath: string,
  allowedTokens: Set<number>,
  epochOffsetSec: number,
): Promise<TickRow[]> {
  const rows: TickRow[] = [];

  for await (const line of readLines(filePath)) {
    const parsed = parseMarketDataLine(line);
    if (!allowedTokens.has(parsed.token)) continue;
    rows.push({
      token: parsed.token,
      timestampSec: parsed.timestampRaw + epochOffsetSec,
      bid: parsed.bid,
      ask: parsed.ask,
      ltp: parsed.ltp,
    });
  }

  rows.sort((a, b) => a.timestampSec - b.timestampSec);
  return rows;
}
