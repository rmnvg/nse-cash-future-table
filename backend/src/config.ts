import "dotenv/config";
import path from "node:path";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const dataDir = requireEnv("DATA_DIR");

export const config = {
  databaseUrl: requireEnv("DATABASE_URL"),
  dataDir,
  cmContractFile: path.resolve(dataDir, requireEnv("CM_CONTRACT_FILE")),
  foContractFile: path.resolve(dataDir, requireEnv("FO_CONTRACT_FILE")),
  cmMarketDataFile: path.resolve(dataDir, requireEnv("CM_MARKET_DATA_FILE")),
  foMarketDataFile: path.resolve(dataDir, requireEnv("FO_MARKET_DATA_FILE")),
  nseEpochOffsetSec: Number(requireEnv("NSE_EPOCH_OFFSET_SEC")),
  tickIntervalMs: Number(requireEnv("TICK_INTERVAL_MS")),
  port: Number(requireEnv("PORT")),
};
