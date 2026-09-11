// Both contract files (NSECM + NSEFO) are SPACE-delimited despite the
// .csv extension, with no header row. Each line has exactly 14
// whitespace-separated fields, in this order:
//   0 token, 1 streamId, 2 instrumentType, 3 symbol, 4 expiryDate,
//   5 strikePrice, 6 optionType, 7 lotSize, 8 lotSize2, 9 tickSize,
//   10 freezeQuantity, 11 minPriceRange, 12 maxPriceRange, 13 contractName
// Example (FO file):
//   35000 8 OPTIDX BANKNIFTY 1475159400 7260000 CE 30 30 5 601 5 2005 BANKNIFTY26SEP72600CE
//
// We only need columns 0 (token), 2 (instrumentType), 3 (symbol),
// 4 (expiryDate — FO file only), 13 (contractName).

export interface CmContractRow {
  token: number;
  symbol: string;
  instrumentType: string;
  contractName: string;
}

export interface FoContractRow {
  token: number;
  symbol: string;
  instrumentType: string;
  expiryDateRaw: number;
  contractName: string;
}

export function parseCmContractLine(line: string): CmContractRow {
  const fields = line.trim().split(/\s+/);
  return {
    token: Number(fields[0]),
    instrumentType: fields[2],
    symbol: fields[3],
    contractName: fields[13],
  };
}

export function parseFoContractLine(line: string): FoContractRow {
  const fields = line.trim().split(/\s+/);
  return {
    token: Number(fields[0]),
    instrumentType: fields[2],
    symbol: fields[3],
    expiryDateRaw: Number(fields[4]),
    contractName: fields[13],
  };
}
