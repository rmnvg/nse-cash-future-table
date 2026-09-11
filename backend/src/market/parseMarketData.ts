// Market data files ARE genuinely comma-delimited (unlike the contract
// files). No header row. 5 columns per line: token,timestamp,bid,ask,ltp
// Example: 2885,1472986477,132650,132660,132650
// bid/ask/ltp are integers in PAISE — divided by 100 downstream (in the
// simulator), not here.

export interface MarketDataLine {
  token: number;
  timestampRaw: number;
  bid: number;
  ask: number;
  ltp: number;
}

export function parseMarketDataLine(line: string): MarketDataLine {
  const fields = line.trim().split(",");
  return {
    token: Number(fields[0]),
    timestampRaw: Number(fields[1]),
    bid: Number(fields[2]),
    ask: Number(fields[3]),
    ltp: Number(fields[4]),
  };
}
