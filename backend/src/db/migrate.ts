import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { pool } from "./pool.js";

const schemaPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "schema.sql",
);

async function migrate() {
  const schema = await readFile(schemaPath, "utf8");
  await pool.query(schema);
  console.log("Migration applied: cm_contracts, fo_contracts created.");
  await pool.end();
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
