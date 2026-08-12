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
import { readdir, readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import { z } from 'zod';
import { loadCutoverEnv } from '../../../scripts/load-cutover-env.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(__dirname, '..', 'migrations');

/**
 * Ledger for webapp SQL files — distinct from integrator `schema_migrations` (`version` PK).
 * Always qualified as `public.*`: DB role may use `search_path` with `integrator` first.
 */
const WEBAPP_MIGRATIONS_TABLE = 'public.webapp_schema_migrations';
const LEGACY_MIGRATION_MODE_VALUES = new Set(['manual', 'bootstrap', 'emergency']);
const migrationFileNameSchema = z
  .string()
  .trim()
  .min(1)
  .refine((name) => name.endsWith('.sql'), {
    message: 'Migration filename must end with .sql',
  });
loadCutoverEnv();

function resolveLegacyMigrationMode() {
  const raw = process.env.WEBAPP_LEGACY_MIGRATIONS_MODE?.trim().toLowerCase();
  if (!raw) {
    return 'manual';
  }
  if (!LEGACY_MIGRATION_MODE_VALUES.has(raw)) {
    console.error(
      `[migrate:legacy] Invalid WEBAPP_LEGACY_MIGRATIONS_MODE="${raw}". ` +
        'Expected one of: manual, bootstrap, emergency.',
    );
    process.exit(1);
  }
  return raw;
}

function enforceLegacyMigrationGuardrails(mode) {
  const runningInCi = process.env.CI === 'true';
  if (runningInCi && mode === 'manual') {
    console.error(
      '[migrate:legacy] Blocked in CI regular flow. ' +
        'Use Drizzle migrate for regular pipelines. ' +
        'If this is an emergency/bootstrap run, set WEBAPP_LEGACY_MIGRATIONS_MODE=bootstrap or emergency explicitly.',
    );
    process.exit(1);
  }

  console.warn(
    `[migrate:legacy] WARNING: legacy SQL runner is emergency/bootstrap only; mode=${mode}. ` +
      'Regular flow must use `pnpm run migrate` (Drizzle).',
  );
}

async function ensureWebappMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${WEBAPP_MIGRATIONS_TABLE} (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

async function main() {
  const legacyMode = resolveLegacyMigrationMode();
  enforceLegacyMigrationGuardrails(legacyMode);

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL is not set');
    process.exit(1);
  }

  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    await ensureWebappMigrationsTable(client);

    const files = (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort();

    for (const rawFile of files) {
      const file = migrationFileNameSchema.parse(rawFile);
      const already = await client.query(
        `SELECT 1 FROM ${WEBAPP_MIGRATIONS_TABLE} WHERE filename = $1`,
        [file],
      );
      if (already.rowCount > 0) {
        console.log(`Skipping ${file} (already applied)`);
        continue;
      }

      const filePath = join(migrationsDir, file);
      const sql = await readFile(filePath, 'utf-8');
      console.log(`Running ${file}...`);
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query(`INSERT INTO ${WEBAPP_MIGRATIONS_TABLE} (filename) VALUES ($1)`, [file]);
        await client.query('COMMIT');
      } catch (err) {
        try {
          await client.query('ROLLBACK');
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
  console.log('Migrations complete.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
