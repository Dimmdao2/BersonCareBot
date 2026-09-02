/**
 * WHAT BREAKS WITHOUT THIS: a full account purge of a canonical-only user leaves the whole
 * `reminder_occurrence_history` of that person in the database — the row has no FK to
 * `platform_users`, so nothing cascades it away, and the only DELETE that ever named the table was
 * keyed on the retired public identity (systemic audit 2026-08-27 §C1; live TEST census at the
 * time: 130 rows across 33 users who never had one).
 *
 * ORACLE: the canonical platform user uuid is the ONLY account-purge key. The retired public
 * identity was a `bigint`, so no purge statement may bind the account key as one.
 */
import { describe, expect, it, vi } from 'vitest';
import type { SQL } from 'drizzle-orm';
import type { PoolClient } from 'pg';
import { drizzleSqlFragmentToPgQuery } from '@/infra/db/drizzleSqlDebugText';

const { runPurgeClientSql } = vi.hoisted(() => ({ runPurgeClientSql: vi.fn() }));

vi.mock('@/infra/platformUserPurgeSql', () => ({
  runPurgeClientSql,
  runPurgePoolSql: vi.fn(),
}));

import { runWebappPurgeCoreInTransaction } from './platformUserFullPurge';

const fakeClient = {} as PoolClient;
const USER_ID = '22222222-2222-4222-8222-222222222222';

/** Statements the purge issued, exactly as PostgreSQL would receive them (`runPurgeClientSql(client, fragment)`). */
function issuedStatements(): { text: string; values: readonly unknown[] }[] {
  return runPurgeClientSql.mock.calls.map((call) => {
    const { sql, values } = drizzleSqlFragmentToPgQuery(call[1] as SQL);
    return { text: sql, values };
  });
}

describe('account purge — reminder history is keyed on the canonical platform user', () => {
  it('deletes reminder_occurrence_history by platform_user_id', async () => {
    runPurgeClientSql.mockReset();
    runPurgeClientSql.mockResolvedValue({ rows: [], rowCount: 0 });

    await runWebappPurgeCoreInTransaction(fakeClient, {
      id: USER_ID,
      phone_normalized: null,
      role: 'client',
    });

    const statements = issuedStatements();
    const canonicalDelete = statements.find(
      (s) =>
        /DELETE FROM reminder_occurrence_history/.test(s.text) &&
        /platform_user_id/.test(s.text) &&
        s.values[0] === USER_ID,
    );
    expect(canonicalDelete).toBeDefined();

    // The account purge has no numeric-identity fallback or compatibility tail: the retired public
    // identity was the only `bigint` account key this transaction ever bound.
    expect(statements.some((s) => /\$1::bigint/.test(s.text))).toBe(false);
  });
});
