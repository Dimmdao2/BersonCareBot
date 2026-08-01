/**
 * Pilot test for the disposable-PostgreSQL harness (block Б1, #1081).
 *
 * Deliberately minimal: this proves the harness plumbing is alive (clone connects, schema came
 * from the real migration chain) and nothing about product behaviour. It is not a stand-in for the
 * block В1 tenant-wall matrix, which is separate, later work against this same harness.
 *
 * Named poломка this catches: the vitest.postgres.* wiring (globalSetup template build, per-file
 * clone, DATABASE_URL handoff) silently produces a database with no migrations applied, or no
 * database at all -- either would surface as `platform_users` missing from `information_schema`.
 *
 * UNVERIFIED -- not executed in this sandbox (no PostgreSQL superuser/CREATEDB access; see
 * apps/webapp/scripts/postgres-integration/harness-lib.ts header and
 * docs/_TODO/runs/testsuite-v2/B_DISPOSABLE_PG_REPORT.md "НЕ СДЕЛАНО").
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';

describe('disposable PostgreSQL harness pilot', () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });

  afterAll(async () => {
    await pool.end();
  });

  it('runs against a freshly cloned database whose schema came from the real migration chain', async () => {
    const databaseName = await pool.query<{ current_database: string }>(
      'SELECT current_database()',
    );
    expect(databaseName.rows[0]?.current_database).toMatch(/^pbt_/);

    const platformUsersTable = await pool.query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = 'platform_users'
       ) AS exists`,
    );
    expect(platformUsersTable.rows[0]?.exists).toBe(true);

    const migrationCount = await pool.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM drizzle.__drizzle_migrations',
    );
    expect(Number(migrationCount.rows[0]?.count ?? 0)).toBeGreaterThan(0);
  });
});
