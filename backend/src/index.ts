import { config } from "./config.js";
import { pool } from "./db/pool.js";
import { fetchSymbolUniverse } from "./db/symbolUniverse.js";
import { buildTokenLookup } from "./db/tokenLookup.js";
import { loadFilteredTicks } from "./market/loadFilteredTicks.js";
import { bucketByTimestamp } from "./market/bucketByTimestamp.js";
import { createMarketSimulator, type MarketSimulator } from "./market/simulator.js";
import { initRowState, updateLeg } from "./market/rowState.js";
import { createWsServer } from "./ws/server.js";

async function main() {
  console.log("Starting nse-cash-future-table backend...");

  const universe = await fetchSymbolUniverse();
  if (universe.length === 0) {
    console.error(
      "Symbol universe is empty — no stocks with both a cash and FUTSTK contract were found.\n" +
        "Run `npm run ingest:contracts` first, then restart.",
    );
    await pool.end();
    process.exit(1);
  }
  console.log(`Symbol universe: ${universe.length} stocks`);

  const tokenLookup = buildTokenLookup(universe);
  const allowedTokens = new Set(tokenLookup.keys());
  initRowState(
    universe.map((entry) => ({
      symbol: entry.symbol,
      futureContractName: entry.foContractName,
      futureExpiry: entry.foExpiry.toISOString(),
    })),
  );

  console.log("Loading + filtering CM market data...");
  const cmBuckets = bucketByTimestamp(
    await loadFilteredTicks(config.cmMarketDataFile, allowedTokens, config.nseEpochOffsetSec),
  );
  console.log(`CM: ${cmBuckets.length} buckets`);

  console.log("Loading + filtering FO market data...");
  const foBuckets = bucketByTimestamp(
    await loadFilteredTicks(config.foMarketDataFile, allowedTokens, config.nseEpochOffsetSec),
  );
  console.log(`FO: ${foBuckets.length} buckets`);

  const { broadcastUpdate, close: closeWsServer } = createWsServer();

  function applyTicks(changedTokens: number[], simulator: MarketSimulator): Set<string> {
    const touchedSymbols = new Set<string>();
    for (const token of changedTokens) {
      const lookup = tokenLookup.get(token);
      if (!lookup) continue;
      const tick = simulator.getLatestTick(token);
      if (!tick) continue;
      updateLeg(lookup.symbol, lookup.leg, tick);
      touchedSymbols.add(lookup.symbol);
    }
    return touchedSymbols;
  }

  const cmSimulator = createMarketSimulator(cmBuckets, config.tickIntervalMs, (changedTokens) => {
    broadcastUpdate(applyTicks(changedTokens, cmSimulator));
  });
  const foSimulator = createMarketSimulator(foBuckets, config.tickIntervalMs, (changedTokens) => {
    broadcastUpdate(applyTicks(changedTokens, foSimulator));
  });

  cmSimulator.start();
  foSimulator.start();

  console.log(`listening on ws://localhost:${config.port}`);

  process.on("SIGINT", () => {
    console.log("\nShutting down...");
    cmSimulator.stop();
    foSimulator.stop();
    closeWsServer()
      .then(() => pool.end())
      .then(() => process.exit(0));
  });
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
