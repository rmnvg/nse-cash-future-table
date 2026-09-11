import "dotenv/config";
import { existsSync } from "node:fs";
import path from "node:path";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optionalBool(name: string, fallback: boolean): boolean {
  const value = process.env[name];
  if (value === undefined || value === "") return fallback;
  return value.toLowerCase() === "true";
}

const dataDir = requireEnv("DATA_DIR");

function dataFile(envName: string): string {
  const resolved = path.resolve(dataDir, requireEnv(envName));
  if (!existsSync(resolved)) {
    throw new Error(
      `${envName} not found at ${resolved}\n` +
        `Check that DATA_DIR (currently ${dataDir}) points at the folder holding the 4 NSE CSV files.`,
    );
  }
  return resolved;
}

export const config = {
  databaseUrl: requireEnv("DATABASE_URL"),
  dataDir,
  cmContractFile: dataFile("CM_CONTRACT_FILE"),
  foContractFile: dataFile("FO_CONTRACT_FILE"),
  cmMarketDataFile: dataFile("CM_MARKET_DATA_FILE"),
  foMarketDataFile: dataFile("FO_MARKET_DATA_FILE"),
  nseEpochOffsetSec: Number(requireEnv("NSE_EPOCH_OFFSET_SEC")),
  tickIntervalMs: Number(requireEnv("TICK_INTERVAL_MS")),
  port: Number(requireEnv("PORT")),
  // NSE ships non-tradable test instruments (…NSETEST) in the contract
  // files; they have contracts on both legs but never any market data.
  excludeTestSymbols: optionalBool("EXCLUDE_TEST_SYMBOLS", true),
};
