#!/usr/bin/env node
/**
 * LEGACY: runs SQL files from `apps/webapp/migrations/*.sql` in order.
 *
 * Canonical webapp migrations are Drizzle (`pnpm run migrate`). This runner remains for:
 * - `pnpm run migrate:legacy` on DBs that still need legacy-only SQL, or
 * - bootstrap ordering (legacy first, then Drizzle) on a completely empty database.
 *
 * Usage: `pnpm run migrate:legacy` or `node scripts/run-migrations.mjs`
 * Requires DATABASE_URL (e.g. from .env or environment).
 */
import { readdir, readFile } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import pg from "pg";
import { loadCutoverEnv } from "../../../scripts/load-cutover-env.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(__dirname, "..", "migrations");

/**
 * Ledger for webapp SQL files — must not collide with integrator `schema_migrations` (`version` PK).
 * Always qualified as `public.*`: DB role may use `search_path` with `integrator` first; unqualified
 * `schema_migrations` would then hit `integrator.schema_migrations` and break legacy backfill (`filename`).
 */
const WEBAPP_MIGRATIONS_TABLE = "public.webapp_schema_migrations";
const LEGACY_PUBLIC_SCHEMA_MIGRATIONS = "public.schema_migrations";

loadCutoverEnv();

/**
 * If this DB was created with an older webapp runner, applied files were recorded in
 * `schema_migrations (filename, ...)`. On unified DB, integrator owns `schema_migrations (version, ...)`,
 * so we use WEBAPP_MIGRATIONS_TABLE and copy legacy rows once when possible.
 */
async function ensureWebappMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${WEBAPP_MIGRATIONS_TABLE} (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

async function backfillLedgerFromLegacyWebappTable(client) {
  const col = await client.query(
    `SELECT 1
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'schema_migrations'
       AND column_name = 'filename'`
  );
  if (col.rowCount === 0) {
    return;
  }

  const count = await client.query(
    `SELECT COUNT(*)::int AS c FROM ${WEBAPP_MIGRATIONS_TABLE}`
  );
  if ((count.rows[0]?.c ?? 0) > 0) {
    return;
  }

  await client.query(`
    INSERT INTO ${WEBAPP_MIGRATIONS_TABLE} (filename, applied_at)
    SELECT filename, COALESCE(applied_at, now())
    FROM ${LEGACY_PUBLIC_SCHEMA_MIGRATIONS}
    ON CONFLICT (filename) DO NOTHING
  `);
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
  }

  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    await ensureWebappMigrationsTable(client);
    await backfillLedgerFromLegacyWebappTable(client);

    const files = (await readdir(migrationsDir))
      .filter((f) => f.endsWith(".sql"))
      .sort();

    for (const file of files) {
      const already = await client.query(
        `SELECT 1 FROM ${WEBAPP_MIGRATIONS_TABLE} WHERE filename = $1`,
        [file]
      );
      if (already.rowCount > 0) {
        console.log(`Skipping ${file} (already applied)`);
        continue;
      }

      const filePath = join(migrationsDir, file);
      const sql = await readFile(filePath, "utf-8");
      console.log(`Running ${file}...`);
      try {
        await client.query("BEGIN");
        await client.query(sql);
        await client.query(
          `INSERT INTO ${WEBAPP_MIGRATIONS_TABLE} (filename) VALUES ($1)`,
          [file]
        );
        await client.query("COMMIT");
      } catch (err) {
        try {
          await client.query("ROLLBACK");
        } catch {
          // Best effort rollback; preserve original migration error.
        }
        throw err;
      }
      console.log(`  done`);
    }
  } finally {
    await client.end();
  }
  console.log("Migrations complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
