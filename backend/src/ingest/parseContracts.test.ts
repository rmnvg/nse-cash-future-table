import { describe, it, expect } from "vitest";
import { parseCmContractLine, parseFoContractLine } from "./parseContracts.js";

// Real lines taken verbatim from the provided contract files.
const CM_LINE = "2885 4 EQUITY RELIANCE -1 -1 EQ 1 1 10 1 -1 -1 RELIANCE";
const FO_FUT_LINE =
  "68777 11 FUTSTK RELIANCE 1475159400 -1 XX 500 500 10 20001 118410 144710 RELIANCE26SEPFUT";
const FO_OPT_LINE =
  "35000 8 OPTIDX BANKNIFTY 1475159400 7260000 CE 30 30 5 601 5 2005 BANKNIFTY26SEP72600CE";

describe("parseCmContractLine", () => {
  it("pulls token, symbol, instrumentType and contractName from a space-delimited line", () => {
    expect(parseCmContractLine(CM_LINE)).toEqual({
      token: 2885,
      symbol: "RELIANCE",
      instrumentType: "EQUITY",
      contractName: "RELIANCE",
    });
  });

  it("tolerates leading/trailing whitespace and repeated separators", () => {
    expect(parseCmContractLine(`  ${CM_LINE.replace(/ /g, "  ")}  `)).toEqual({
      token: 2885,
      symbol: "RELIANCE",
      instrumentType: "EQUITY",
      contractName: "RELIANCE",
    });
  });
});

describe("parseFoContractLine", () => {
  it("parses a FUTSTK line including the raw expiry", () => {
    expect(parseFoContractLine(FO_FUT_LINE)).toEqual({
      token: 68777,
      symbol: "RELIANCE",
      instrumentType: "FUTSTK",
      expiryDateRaw: 1475159400,
      lotSize: 500,
      contractName: "RELIANCE26SEPFUT",
    });
  });

  it("reads the lot size used to size a spread per contract", () => {
    expect(parseFoContractLine(FO_FUT_LINE).lotSize).toBe(500);
  });

  it("parses non-FUTSTK rows too — filtering happens at ingestion, not here", () => {
    expect(parseFoContractLine(FO_OPT_LINE).instrumentType).toBe("OPTIDX");
  });
});

describe("NSE epoch offset", () => {
  const NSE_EPOCH_OFFSET_SEC = 315513000;

  it("converts RELIANCE's September future expiry to 2026-09-29T09:00:00Z", () => {
    const { expiryDateRaw } = parseFoContractLine(FO_FUT_LINE);
    const utc = new Date((expiryDateRaw + NSE_EPOCH_OFFSET_SEC) * 1000);
    expect(utc.toISOString()).toBe("2026-09-29T09:00:00.000Z");
  });
});
