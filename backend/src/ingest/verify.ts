import { pool } from "../db/pool.js";

async function main() {
  const cmCount = await pool.query("SELECT count(*) FROM cm_contracts");
  const foCount = await pool.query("SELECT count(*) FROM fo_contracts");
  const bothCount = await pool.query(`
    SELECT count(DISTINCT cm.symbol)
    FROM cm_contracts cm
    INNER JOIN fo_contracts fo ON fo.symbol = cm.symbol
  `);

  console.log(`cm_contracts count: ${cmCount.rows[0].count}`);
  console.log(`fo_contracts count: ${foCount.rows[0].count}`);
  console.log(`symbols present in both: ${bothCount.rows[0].count}`);

  const relianceCm = await pool.query(
    "SELECT token, symbol, instrument_type, contract_name FROM cm_contracts WHERE symbol = $1",
    ["RELIANCE"],
  );
  const relianceFo = await pool.query(
    `SELECT token, symbol, instrument_type, expiry_date, contract_name
     FROM fo_contracts WHERE symbol = $1
     ORDER BY expiry_date ASC`,
    ["RELIANCE"],
  );

  console.log("\nRELIANCE cash contract:");
  console.table(relianceCm.rows);

  console.log("\nRELIANCE FUTSTK contracts (ordered by expiry_date ascending):");
  console.table(relianceFo.rows);

  await pool.end();
}

main().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});
