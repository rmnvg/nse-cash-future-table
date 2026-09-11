import { fetchSymbolUniverse } from "./symbolUniverse.js";
import { pool } from "./pool.js";

async function main() {
  const universe = await fetchSymbolUniverse();
  console.log(`Symbol universe size: ${universe.length}`);
  console.table(universe.slice(0, 5));
  await pool.end();
}

main().catch((err) => {
  console.error("check:universe failed:", err);
  process.exit(1);
});
