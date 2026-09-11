import { config } from "../config.js";
import { pool } from "../db/pool.js";
import { fetchSymbolUniverse } from "../db/symbolUniverse.js";
import { buildTokenLookup } from "../db/tokenLookup.js";
import { loadFilteredTicks } from "./loadFilteredTicks.js";
import { bucketByTimestamp } from "./bucketByTimestamp.js";
import { createMarketSimulator } from "./simulator.js";

const TEST_TICK_INTERVAL_MS = 50;
const MAX_CHANGES_TO_LOG = 20;

async function main() {
  const universe = await fetchSymbolUniverse();
  console.log(`Symbol universe size: ${universe.length}`);

  const tokenLookup = buildTokenLookup(universe);
  const allowedTokens = new Set(tokenLookup.keys());
  console.log(`Allowed tokens: ${allowedTokens.size}`);

  const reliance = universe.find((e) => e.symbol === "RELIANCE");
  if (!reliance) {
    throw new Error("RELIANCE not found in symbol universe");
  }

  console.log("Loading + filtering CM market data...");
  const cmRows = await loadFilteredTicks(
    config.cmMarketDataFile,
    allowedTokens,
    config.nseEpochOffsetSec,
  );
  const cmBuckets = bucketByTimestamp(cmRows);
  console.log(`CM: ${cmRows.length} rows survived filtering, ${cmBuckets.length} buckets`);

  console.log("Loading + filtering FO market data...");
  const foRows = await loadFilteredTicks(
    config.foMarketDataFile,
    allowedTokens,
    config.nseEpochOffsetSec,
  );
  const foBuckets = bucketByTimestamp(foRows);
  console.log(`FO: ${foRows.length} rows survived filtering, ${foBuckets.length} buckets`);

  let changeCount = 0;

  function finish() {
    cmSimulator.stop();
    foSimulator.stop();
    pool.end();
  }

  function maybeLog(changedTokens: number[]) {
    if (changeCount >= MAX_CHANGES_TO_LOG) return;
    if (
      !changedTokens.includes(reliance!.cmToken) &&
      !changedTokens.includes(reliance!.foToken)
    ) {
      return;
    }

    const cash = cmSimulator.getLatestTick(reliance!.cmToken);
    const future = foSimulator.getLatestTick(reliance!.foToken);
    changeCount += 1;
    console.log(
      `[change ${changeCount}] RELIANCE cash=${JSON.stringify(cash)} future=${JSON.stringify(future)}`,
    );

    if (changeCount >= MAX_CHANGES_TO_LOG) {
      finish();
    }
  }

  const cmSimulator = createMarketSimulator(cmBuckets, TEST_TICK_INTERVAL_MS, maybeLog);
  const foSimulator = createMarketSimulator(foBuckets, TEST_TICK_INTERVAL_MS, maybeLog);

  cmSimulator.start();
  foSimulator.start();
}

main().catch((err) => {
  console.error("testSimulator failed:", err);
  process.exit(1);
});
