#!/usr/bin/env node
/**
 * Compares COUNT(public base tables) with number of `pgTable` exports in db/schema/schema.ts.
 * Requires DATABASE_URL (e.g. apps/webapp/.env.dev). Skips with exit 0 if unset (CI without DB).
 */
import fs from "node:fs";
import path from "node:path";
import { config } from "dotenv";
import pg from "pg";

config({ path: path.resolve(process.cwd(), ".env.dev") });
config();

const url = process.env.DATABASE_URL?.trim();
if (!url) {
  console.log(
    "[verify-drizzle-public-table-count] SKIP: DATABASE_URL not set (no DB to compare)",
  );
  process.exit(0);
}

const schemaPath = path.join(process.cwd(), "db/schema/schema.ts");
const schemaText = fs.readFileSync(schemaPath, "utf8");
const fileCount = (schemaText.match(/^export const \w+ = pgTable\(/gm) ?? []).length;

const pool = new pg.Pool({ connectionString: url });
try {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS c FROM information_schema.tables
     WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`,
  );
  const dbCount = rows[0]?.c ?? -1;
  if (dbCount !== fileCount) {
    console.error(
      `[verify-drizzle-public-table-count] MISMATCH: DB public BASE TABLE count=${dbCount}, pgTable exports in schema.ts=${fileCount}`,
    );
    process.exit(1);
  }
  console.log(
    `[verify-drizzle-public-table-count] OK: ${dbCount} public tables match pgTable exports`,
  );
} finally {
  await pool.end();
}
