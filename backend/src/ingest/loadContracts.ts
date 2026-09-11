import { config } from "../config.js";
import { pool } from "../db/pool.js";
import { readLines } from "./lineReader.js";
import {
  parseCmContractLine,
  parseFoContractLine,
  type CmContractRow,
  type FoContractRow,
} from "./parseContracts.js";

const BATCH_SIZE = 1000;

async function insertCmBatch(rows: CmContractRow[]): Promise<void> {
  if (rows.length === 0) return;
  const values: unknown[] = [];
  const placeholders = rows.map((row, i) => {
    const base = i * 4;
    values.push(row.token, row.symbol, row.instrumentType, row.contractName);
    return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`;
  });
  await pool.query(
    `INSERT INTO cm_contracts (token, symbol, instrument_type, contract_name)
     VALUES ${placeholders.join(", ")}
     ON CONFLICT (token) DO NOTHING`,
    values,
  );
}

async function insertFoBatch(
  rows: (FoContractRow & { expiryDate: Date })[],
): Promise<void> {
  if (rows.length === 0) return;
  const values: unknown[] = [];
  const placeholders = rows.map((row, i) => {
    const base = i * 5;
    values.push(
      row.token,
      row.symbol,
      row.instrumentType,
      row.expiryDate,
      row.contractName,
    );
    return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`;
  });
  await pool.query(
    `INSERT INTO fo_contracts (token, symbol, instrument_type, expiry_date, contract_name)
     VALUES ${placeholders.join(", ")}
     ON CONFLICT (token) DO NOTHING`,
    values,
  );
}

async function loadCmContracts(): Promise<number> {
  let batch: CmContractRow[] = [];
  let total = 0;

  for await (const line of readLines(config.cmContractFile)) {
    batch.push(parseCmContractLine(line));
    if (batch.length >= BATCH_SIZE) {
      await insertCmBatch(batch);
      total += batch.length;
      batch = [];
    }
  }
  await insertCmBatch(batch);
  total += batch.length;

  return total;
}

async function loadFoContracts(): Promise<{ inserted: number; skipped: number }> {
  let batch: (FoContractRow & { expiryDate: Date })[] = [];
  let inserted = 0;
  let skipped = 0;

  for await (const line of readLines(config.foContractFile)) {
    const row = parseFoContractLine(line);
    if (row.instrumentType !== "FUTSTK") {
      skipped += 1;
      continue;
    }
    const expiryDate = new Date(
      (row.expiryDateRaw + config.nseEpochOffsetSec) * 1000,
    );
    batch.push({ ...row, expiryDate });
    if (batch.length >= BATCH_SIZE) {
      await insertFoBatch(batch);
      inserted += batch.length;
      batch = [];
    }
  }
  await insertFoBatch(batch);
  inserted += batch.length;

  return { inserted, skipped };
}

async function main() {
  const cmCount = await loadCmContracts();
  console.log(`cm_contracts: inserted ${cmCount} rows`);

  const { inserted: foCount, skipped } = await loadFoContracts();
  console.log(`fo_contracts: inserted ${foCount} rows (skipped ${skipped} non-FUTSTK rows)`);

  await pool.end();
}

main().catch((err) => {
  console.error("Contract ingestion failed:", err);
  process.exit(1);
});
