import { sql } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';
import type { DbPort } from '../../kernel/contracts/index.js';
import type { IntegratorDrizzleDb } from './drizzle.js';
import { createDbPort } from './client.js';
import { runWithInfraPrincipal } from '../principal/organizationPrincipal.js';
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

// Guards against running against anything but a named DEV/TEST database — no fixture data is
// read or written by this check, just the current connection's own identity.
async function assertTestDatabase(db: DbPort): Promise<void> {
  const result = await runIntegratorSql<{ database_name: string }>(
    db,
    sql`SELECT current_database() AS database_name`,
  );
  const name = result.rows[0]?.database_name ?? '';
  if (name !== 'bcb_webapp_dev' && !/_test$/i.test(name)) {
    throw new Error(
      `refusing runtime connection: current_database="${name}" — expected bcb_webapp_dev or a *_test database`,
    );
  }
}

describe.skipIf(!enabled)('runIntegratorSql transaction errors (opt-in, allowed TEST DbPort)', () => {
  it('propagates PostgreSQL 42501 from the active Drizzle transaction without DbPort fallback', async () => {
    let fallback: ReturnType<typeof vi.spyOn> | undefined;
    let statement: ReturnType<typeof vi.spyOn> | undefined;

    let caught: unknown;
    try {
      await runWithInfraPrincipal({ source: 'worker:outgoing-delivery-tick' }, async () => {
        const db = createDbPort();
        await assertTestDatabase(db);
        await db.tx(async (txDb) => {
          fallback = vi.spyOn(txDb, 'query');
          const active = txDb as DbPort & { integratorDrizzle?: Pick<IntegratorDrizzleDb, 'execute'> };
          if (!active.integratorDrizzle) throw new Error('active Drizzle transaction is required');
          statement = vi.spyOn(active.integratorDrizzle, 'execute');
          await runIntegratorSql(
            txDb,
            sql`SELECT rolpassword FROM pg_catalog.pg_authid LIMIT 1`,
          );
        });
      });
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
