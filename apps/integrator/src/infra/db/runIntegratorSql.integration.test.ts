import { sql } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';
import type { DbPort } from '../../kernel/contracts/index.js';
import type { IntegratorDrizzleDb } from './drizzle.js';
import { createRealPostgresIntegrationTestHarness } from './realPostgresIntegrationTestHarness.js';
import { runIntegratorSql } from './runIntegratorSql.js';

const enabled =
  process.env.RUN_INTEGRATOR_SQL_PERMISSION_TEST === '1' &&
  process.env.USE_REAL_DATABASE === '1' &&
  process.env.DB_PRINCIPAL_CONTEXT_MODE === 'port-context' &&
  Boolean((process.env.INTEGRATOR_DB_URL ?? '').trim());

function findSqlStateInErrorChain(error: unknown, expected: string): string | undefined {
  const seen = new Set<object>();
  let cursor: unknown = error;
  while (typeof cursor === 'object' && cursor !== null && !seen.has(cursor)) {
    seen.add(cursor);
    const candidate = cursor as { code?: unknown; cause?: unknown };
    if (candidate.code === expected) return expected;
    cursor = candidate.cause;
  }
  return undefined;
}

describe.skipIf(!enabled)('runIntegratorSql transaction errors (opt-in, allowed TEST DbPort)', () => {
  const harness = createRealPostgresIntegrationTestHarness(
    'worker:outgoing-delivery-tick',
    'port-context',
  );

  it('propagates PostgreSQL 42501 from the active Drizzle transaction without DbPort fallback', async () => {
    await harness.assertTestDatabases();
    let fallback: ReturnType<typeof vi.spyOn> | undefined;
    let statement: ReturnType<typeof vi.spyOn> | undefined;

    let caught: unknown;
    try {
      await harness.withRuntime((db) =>
        db.tx(async (txDb) => {
          fallback = vi.spyOn(txDb, 'query');
          const active = txDb as DbPort & { integratorDrizzle?: Pick<IntegratorDrizzleDb, 'execute'> };
          if (!active.integratorDrizzle) throw new Error('active Drizzle transaction is required');
          statement = vi.spyOn(active.integratorDrizzle, 'execute');
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
    expect(findSqlStateInErrorChain(caught, '42501')).toBe('42501');
    expect(statement).toBeDefined();
    expect(statement).toHaveBeenCalledTimes(1);
    expect(fallback).toBeDefined();
    expect(fallback).not.toHaveBeenCalled();
  });
});
