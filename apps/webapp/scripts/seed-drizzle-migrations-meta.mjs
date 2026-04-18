#!/usr/bin/env node
/**
 * Inserts rows into drizzle.__drizzle_migrations for each entry in meta/_journal.json
 * when missing (matched by sha256 of the .sql file — same algorithm as drizzle-orm migrator).
 *
 * Use when SQL from db/drizzle-migrations/*.sql was applied outside `drizzle-kit migrate`
 * or to repair an empty journal table after a successful manual apply.
 *
 * Requires DATABASE_URL (e.g. .env.dev). Does not execute migration SQL.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { config } from "dotenv";
import pg from "pg";

config({ path: path.resolve(process.cwd(), ".env.dev") });
config();

const url = process.env.DATABASE_URL?.trim();
if (!url) {
  console.error("[seed-drizzle-migrations-meta] DATABASE_URL is required");
  process.exit(1);
}

const journalPath = path.join(process.cwd(), "db/drizzle-migrations/meta/_journal.json");
const journal = JSON.parse(fs.readFileSync(journalPath, "utf8"));

const pool = new pg.Pool({ connectionString: url });
try {
  await pool.query("CREATE SCHEMA IF NOT EXISTS drizzle");
  await pool.query(`CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
    id SERIAL PRIMARY KEY,
    hash text NOT NULL,
    created_at bigint
  )`);

  for (const entry of journal.entries) {
    const filePath = path.join(process.cwd(), "db/drizzle-migrations", `${entry.tag}.sql`);
    const sqlText = fs.readFileSync(filePath, "utf8");
    const hash = crypto.createHash("sha256").update(sqlText).digest("hex");
    const { rowCount } = await pool.query(
      "SELECT 1 FROM drizzle.__drizzle_migrations WHERE hash = $1 LIMIT 1",
      [hash],
    );
    if (rowCount > 0) {
      console.log("[seed-drizzle-migrations-meta] skip (hash exists):", entry.tag);
      continue;
    }
    await pool.query(
      'INSERT INTO drizzle.__drizzle_migrations ("hash", "created_at") VALUES ($1, $2)',
      [hash, entry.when],
    );
    console.log("[seed-drizzle-migrations-meta] inserted:", entry.tag);
  }
  console.log("[seed-drizzle-migrations-meta] OK");
} finally {
  await pool.end();
}
