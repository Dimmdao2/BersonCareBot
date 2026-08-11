import { sql } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';
import { createRealPostgresIntegrationTestHarness } from './realPostgresIntegrationTestHarness.js';
import { runIntegratorSql } from './runIntegratorSql.js';

const enabled =
  process.env.RUN_INTEGRATOR_SQL_PERMISSION_TEST === '1' &&
  process.env.USE_REAL_DATABASE === '1' &&
  Boolean((process.env.DATABASE_URL ?? '').trim()) &&
  Boolean((process.env.DB_PRINCIPAL_SIGNING_SECRET ?? '').trim());

describe.skipIf(!enabled)('runIntegratorSql transaction errors (opt-in, allowed TEST DbPort)', () => {
  const harness = createRealPostgresIntegrationTestHarness('worker:outgoing-delivery-tick');

  it('propagates PostgreSQL 42501 from the active Drizzle transaction without DbPort fallback', async () => {
    await harness.assertTestDatabases();
    let fallback: ReturnType<typeof vi.spyOn> | undefined;

    let caught: unknown;
    try {
      await harness.withRuntime((db) =>
        db.tx(async (txDb) => {
          fallback = vi.spyOn(txDb, 'query');
          await runIntegratorSql(
            txDb,
            sql`SELECT rolpassword FROM pg_catalog.pg_authid LIMIT 1`,
          );
        }),
      );
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error & { code?: string }).code).toBe('42501');
    expect(fallback).toBeDefined();
    expect(fallback).not.toHaveBeenCalled();
  });
});
