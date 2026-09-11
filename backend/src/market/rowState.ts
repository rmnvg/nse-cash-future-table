export type Leg = "cash" | "future";

export interface LegTick {
  bid: number;
  ask: number;
  ltp: number;
}

interface RowStateEntry {
  stockBid: number | null;
  stockAsk: number | null;
  stockLtp: number | null;
  futureBid: number | null;
  futureAsk: number | null;
  futureLtp: number | null;
}

export interface ComputedRow {
  symbol: string;
  stockLtp: number | null;
  futureLtp: number | null;
  buySpread: number | null;
  sellSpread: number | null;
}

const rowState = new Map<string, RowStateEntry>();

function emptyEntry(): RowStateEntry {
  return {
    stockBid: null,
    stockAsk: null,
    stockLtp: null,
    futureBid: null,
    futureAsk: null,
    futureLtp: null,
  };
}

export function initRowState(symbols: string[]): void {
  rowState.clear();
  for (const symbol of symbols) {
    rowState.set(symbol, emptyEntry());
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

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function computeRow(symbol: string): ComputedRow {
  const entry = rowState.get(symbol) ?? emptyEntry();

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
    stockLtp: entry.stockLtp !== null ? round2(entry.stockLtp) : null,
    futureLtp: entry.futureLtp !== null ? round2(entry.futureLtp) : null,
    buySpread,
    sellSpread,
  };
}

export function getAllSymbols(): string[] {
  return Array.from(rowState.keys());
}
