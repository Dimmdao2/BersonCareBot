/**
 * Pilot test for the disposable-PostgreSQL harness (block Б1, #1081).
 *
 * Deliberately minimal: this proves the harness plumbing is alive (clone connects, schema came
 * from the real migration chain) and nothing about product behaviour. It is not a stand-in for the
 * block В1 tenant-wall matrix, which is separate, later work against this same harness.
 *
 * Named поломка this catches: the vitest.postgres.* wiring (globalSetup template build, per-file
 * clone, DATABASE_URL handoff) silently produces a database with no migrations applied, or no
 * database at all -- either would surface as `platform_users` missing from `information_schema`.
 * Blind-audit acceptance: omitting the committed A0 integrator ledger makes a clone structurally
 * inconsistent with its baseline even though no integrator migrations are allowed to run here.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { sql } from 'drizzle-orm';
import pg from 'pg';
import { getWebappSqlFromPgClient, type WebappSqlExecutor } from '@/infra/db/runWebappSql';

type A0MigrationManifest = {
  ledgers: { integrator: { entries: { version: string }[] } };
};

const a0Manifest = JSON.parse(
  readFileSync(
    new URL(
      '../../../../../docs/ARCHITECTURE/DB_DUMPS/a0-greenfield/migration-manifest.json',
      import.meta.url,
    ),
    'utf8',
  ),
) as A0MigrationManifest;

describe('disposable PostgreSQL harness pilot', () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  let client: pg.PoolClient;
  let db: WebappSqlExecutor;

  beforeAll(async () => {
    client = await pool.connect();
    db = getWebappSqlFromPgClient(client);
  });

  afterAll(async () => {
    client.release();
    await pool.end();
  });

  it('runs against a freshly cloned database whose schema came from the real migration chain', async () => {
    const databaseName = await db.execute(sql`SELECT current_database()`);
    expect(
      (databaseName.rows as { current_database: string }[])[0]?.current_database,
    ).toMatch(/^pbt_/);

    const platformUsersTable = await db.execute(
      sql`SELECT EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = 'platform_users'
          ) AS exists`,
    );
    expect((platformUsersTable.rows as { exists: boolean }[])[0]?.exists).toBe(true);

    const migrationCount = await db.execute(
      sql`SELECT count(*)::text AS count FROM drizzle.__drizzle_migrations`,
    );
    expect(Number((migrationCount.rows as { count: string }[])[0]?.count ?? 0)).toBeGreaterThan(0);
  });

  it('transplants the committed A0 integrator ledger without running integrator migrations', async () => {
    const expectedVersions = a0Manifest.ledgers.integrator.entries
      .map((entry) => entry.version)
      .sort();
    const actual = await db.execute(sql`SELECT version FROM integrator.schema_migrations`);
    const actualVersions = (actual.rows as { version: string }[])
      .map((row) => row.version)
      .sort();

    expect(actualVersions).toHaveLength(expectedVersions.length);
    expect(actualVersions).toEqual(expectedVersions);
  });
});
