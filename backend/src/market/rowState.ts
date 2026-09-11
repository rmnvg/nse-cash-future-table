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
  /** Contract multiplier from the NSEFO file; null if absent. */
  lotSize: number | null;
  /** Calendar days from "now" to expiry, used to annualize the basis. */
  daysToExpiry: number | null;
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
 * One row as sent over the WebSocket: latest bid/ask/ltp for both legs (per
 * the brief), the executable spreads, and the derived basis metrics that
 * make stocks at different price levels comparable to each other.
 */
export interface ComputedRow {
  symbol: string;
  futureContractName: string;
  futureExpiry: string;
  daysToExpiry: number | null;
  lotSize: number | null;
  stockBid: number | null;
  stockAsk: number | null;
  stockLtp: number | null;
  futureBid: number | null;
  futureAsk: number | null;
  futureLtp: number | null;
  buySpread: number | null;
  sellSpread: number | null;
  buySpreadPerLot: number | null;
  sellSpreadPerLot: number | null;
  basisPct: number | null;
  annualizedBasisPct: number | null;
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

function round(value: number | null, dp = 2): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  const factor = 10 ** dp;
  return Math.round(value * factor) / factor;
}

/** Whole calendar days between now and an ISO expiry; null if in the past. */
export function daysUntil(expiryIso: string, now: number = Date.now()): number | null {
  const expiryMs = new Date(expiryIso).getTime();
  if (!Number.isFinite(expiryMs)) return null;
  const days = Math.ceil((expiryMs - now) / 86_400_000);
  return days > 0 ? days : null;
}

export function computeRow(symbol: string): ComputedRow {
  const entry =
    rowState.get(symbol) ??
    emptyEntry({
      symbol,
      futureContractName: "",
      futureExpiry: "",
      lotSize: null,
      daysToExpiry: null,
    });

  const { meta } = entry;

  const buySpread =
    entry.futureBid !== null && entry.stockAsk !== null
      ? round(entry.futureBid - entry.stockAsk)
      : null;

  const sellSpread =
    entry.stockBid !== null && entry.futureAsk !== null
      ? round(entry.stockBid - entry.futureAsk)
      : null;

  // Basis uses LTPs rather than bid/ask: it describes where the future is
  // trading relative to spot, independent of how wide the book happens to be.
  const basisPct =
    entry.futureLtp !== null && entry.stockLtp !== null && entry.stockLtp !== 0
      ? round(((entry.futureLtp - entry.stockLtp) / entry.stockLtp) * 100, 3)
      : null;

  // Annualizing makes a 0.4% basis over 17 days comparable with a 0.9% one
  // over 80 days — this is the number a cash-and-carry desk ranks on.
  const annualizedBasisPct =
    basisPct !== null && meta.daysToExpiry
      ? round((basisPct * 365) / meta.daysToExpiry, 2)
      : null;

  return {
    symbol,
    futureContractName: meta.futureContractName,
    futureExpiry: meta.futureExpiry,
    daysToExpiry: meta.daysToExpiry,
    lotSize: meta.lotSize,
    stockBid: round(entry.stockBid),
    stockAsk: round(entry.stockAsk),
    stockLtp: round(entry.stockLtp),
    futureBid: round(entry.futureBid),
    futureAsk: round(entry.futureAsk),
    futureLtp: round(entry.futureLtp),
    buySpread,
    sellSpread,
    buySpreadPerLot:
      buySpread !== null && meta.lotSize ? round(buySpread * meta.lotSize) : null,
    sellSpreadPerLot:
      sellSpread !== null && meta.lotSize ? round(sellSpread * meta.lotSize) : null,
    basisPct,
    annualizedBasisPct,
  };
}

export function getAllSymbols(): string[] {
  return Array.from(rowState.keys());
}
