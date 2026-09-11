export type Leg = "cash" | "future";

export interface LegTick {
  bid: number;
  ask: number;
  ltp: number;
}

/** Static, per-symbol contract info — set once at init, never ticks. */
export interface SymbolMeta {
  symbol: string;
  futureContractName: string;
  futureExpiry: string;
}

interface RowStateEntry {
  meta: SymbolMeta;
  stockBid: number | null;
  stockAsk: number | null;
  stockLtp: number | null;
  futureBid: number | null;
  futureAsk: number | null;
  futureLtp: number | null;
}

/**
 * One row as sent over the WebSocket. Carries the latest bid/ask/ltp for
 * both legs (per the brief) plus the spreads, computed server-side so every
 * client renders identical numbers.
 */
export interface ComputedRow {
  symbol: string;
  futureContractName: string;
  futureExpiry: string;
  stockBid: number | null;
  stockAsk: number | null;
  stockLtp: number | null;
  futureBid: number | null;
  futureAsk: number | null;
  futureLtp: number | null;
  buySpread: number | null;
  sellSpread: number | null;
}

const rowState = new Map<string, RowStateEntry>();

function emptyEntry(meta: SymbolMeta): RowStateEntry {
  return {
    meta,
    stockBid: null,
    stockAsk: null,
    stockLtp: null,
    futureBid: null,
    futureAsk: null,
    futureLtp: null,
  };
}

export function initRowState(symbols: SymbolMeta[]): void {
  rowState.clear();
  for (const meta of symbols) {
    rowState.set(meta.symbol, emptyEntry(meta));
  }
}

export function updateLeg(symbol: string, leg: Leg, tick: LegTick): void {
  const entry = rowState.get(symbol);
  if (!entry) return;

  if (leg === "cash") {
    entry.stockBid = tick.bid;
    entry.stockAsk = tick.ask;
    entry.stockLtp = tick.ltp;
  } else {
    entry.futureBid = tick.bid;
    entry.futureAsk = tick.ask;
    entry.futureLtp = tick.ltp;
  }
}

function round2(value: number | null): number | null {
  return value === null ? null : Math.round(value * 100) / 100;
}

export function computeRow(symbol: string): ComputedRow {
  const entry =
    rowState.get(symbol) ??
    emptyEntry({ symbol, futureContractName: "", futureExpiry: "" });

  const buySpread =
    entry.futureBid !== null && entry.stockAsk !== null
      ? round2(entry.futureBid - entry.stockAsk)
      : null;

  const sellSpread =
    entry.stockBid !== null && entry.futureAsk !== null
      ? round2(entry.stockBid - entry.futureAsk)
      : null;

  return {
    symbol,
    futureContractName: entry.meta.futureContractName,
    futureExpiry: entry.meta.futureExpiry,
    stockBid: round2(entry.stockBid),
    stockAsk: round2(entry.stockAsk),
    stockLtp: round2(entry.stockLtp),
    futureBid: round2(entry.futureBid),
    futureAsk: round2(entry.futureAsk),
    futureLtp: round2(entry.futureLtp),
    buySpread,
    sellSpread,
  };
}

export function getAllSymbols(): string[] {
  return Array.from(rowState.keys());
}
