#!/usr/bin/env node
/**
 * Compares COUNT(public base tables) with total `pgTable` definitions across
 * all Drizzle schema entry files (must stay in sync with `schema:` in
 * `drizzle.config.ts`).
 *
 * Requires DATABASE_URL (e.g. apps/webapp/.env.dev). Skips with exit 0 if unset (CI without DB).
 */
import fs from "node:fs";
import path from "node:path";
import { config } from "dotenv";
import pg from "pg";

config({ path: path.resolve(process.cwd(), ".env.dev") });
config();

/** Keep in sync with `schema:` array in `drizzle.config.ts` (exclude relations-only files). */
const SCHEMA_FILES = [
  "db/schema/schema.ts",
  "db/schema/clinicalTests.ts",
  "db/schema/recommendations.ts",
  "db/schema/treatmentProgramTemplates.ts",
  "db/schema/treatmentProgramInstances.ts",
  "db/schema/treatmentProgramTestAttempts.ts",
  "db/schema/treatmentProgramEvents.ts",
  "db/schema/entityComments.ts",
  "db/schema/courses.ts",
];

/**
 * Public tables that exist in some environments but are not yet represented as `pgTable` in
 * `SCHEMA_FILES` (CMS / patient-home initiative DDL applied outside the Drizzle slice).
 * Remove entries here once the matching `pgTable` is added to `drizzle.config.ts` schema.
 */
const EXCLUDED_PUBLIC_BASE_TABLES = new Set([
  "patient_daily_mood",
  "patient_home_block_items",
  "patient_home_blocks",
  "patient_practice_completions",
]);

const url = process.env.DATABASE_URL?.trim();
if (!url) {
  console.log(
    "[verify-drizzle-public-table-count] SKIP: DATABASE_URL not set (no DB to compare)",
  );
  process.exit(0);
}

let fileCount = 0;
for (const rel of SCHEMA_FILES) {
  const schemaPath = path.join(process.cwd(), rel);
  if (!fs.existsSync(schemaPath)) {
    console.error(`[verify-drizzle-public-table-count] Missing schema file: ${rel}`);
    process.exit(1);
  }
  const schemaText = fs.readFileSync(schemaPath, "utf8");
  fileCount += (schemaText.match(/^export const \w+ = pgTable\(/gm) ?? []).length;
}

const pool = new pg.Pool({ connectionString: url });
try {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS c FROM information_schema.tables
     WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
       AND table_name NOT IN (${[...EXCLUDED_PUBLIC_BASE_TABLES]
         .map((_, i) => `$${i + 1}`)
         .join(", ")})`,
    [...EXCLUDED_PUBLIC_BASE_TABLES],
  );
  const dbCount = rows[0]?.c ?? -1;
  if (dbCount !== fileCount) {
    console.error(
      `[verify-drizzle-public-table-count] MISMATCH: DB public BASE TABLE count=${dbCount}, pgTable exports across schema files=${fileCount}`,
    );
    console.error(
      "  Hint: apply pending Drizzle migrations (db/drizzle-migrations) or re-run introspect if schema drifted.",
    );
    process.exit(1);
  }
  console.log(
    `[verify-drizzle-public-table-count] OK: ${dbCount} public tables match pgTable exports`,
  );
} finally {
  await pool.end();
}
