/**
 * WHAT BREAKS WITHOUT THIS: a full account purge of a user who has no retired `integrator_user_id`
 * leaves the whole `reminder_occurrence_history` of that person in the database — the row has no FK
 * to `platform_users`, so nothing cascades it away, and the only DELETE that ever named the table
 * was keyed on the retired id (systemic audit 2026-08-27 §C1; live TEST census: 130 rows across 33
 * users with `integrator_user_id IS NULL`).
 *
 * ORACLE: the audit finding plus the single retired-id projection census in
 * `@/infra/ops/webappIntegratorUserProjectionRealignment` — never the purge implementation itself.
 */
import { describe, expect, it, vi } from 'vitest';
import type { PoolClient } from 'pg';

const { runPurgeClientPgText } = vi.hoisted(() => ({ runPurgeClientPgText: vi.fn() }));

vi.mock('@/infra/platformUserPurgeSql', () => ({
  runPurgeClientPgText,
  runPurgePoolPgText: vi.fn(),
}));

import {
  purgeCoverageGapsForRetiredIntegratorProjections,
  runWebappPurgeCoreInTransaction,
} from './platformUserFullPurge';
import { WEBAPP_RETIRED_INTEGRATOR_ID_PROJECTIONS } from '@/infra/ops/webappIntegratorUserProjectionRealignment';

const fakeClient = {} as PoolClient;
const USER_ID = '22222222-2222-4222-8222-222222222222';

function issuedStatements(): { text: string; values: readonly unknown[] }[] {
  return runPurgeClientPgText.mock.calls.map((call) => ({
    text: String(call[1]),
    values: (call[2] ?? []) as readonly unknown[],
  }));
}

describe('account purge — reminder history is keyed on the canonical platform user', () => {
  it('deletes reminder_occurrence_history by platform_user_id for a user with no retired id', async () => {
    runPurgeClientPgText.mockReset();
    runPurgeClientPgText.mockResolvedValue({ rows: [], rowCount: 0 });

    await runWebappPurgeCoreInTransaction(fakeClient, {
      id: USER_ID,
      phone_normalized: null,
      integrator_user_id: null,
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

    // ...and the retired-id reconcile tail must not have run at all for this user.
    expect(statements.some((s) => /integrator_user_id = \$1::bigint/.test(s.text))).toBe(false);
  });

  it('still runs the retired-id reconcile tail when the account does carry one', async () => {
    runPurgeClientPgText.mockReset();
    runPurgeClientPgText.mockResolvedValue({ rows: [], rowCount: 0 });

    await runWebappPurgeCoreInTransaction(fakeClient, {
      id: USER_ID,
      phone_normalized: null,
      integrator_user_id: '4242',
      role: 'client',
    });

    const statements = issuedStatements();
    for (const projection of WEBAPP_RETIRED_INTEGRATOR_ID_PROJECTIONS) {
      expect(
        statements.some(
          (s) =>
            s.text.includes(`DELETE FROM ${projection.table} WHERE integrator_user_id = $1::bigint`) &&
            s.values[0] === '4242',
        ),
        `retired-id reconcile tail must still cover ${projection.table}`,
      ).toBe(true);
    }
  });

  it('mechanically covers every retired-id projection by its canonical platform-user key', () => {
    expect(
      purgeCoverageGapsForRetiredIntegratorProjections(),
      'A projection listed in the retired-integrator-id census with no canonical-key delete in the ' +
        'purge is exactly audit §C1: the purge silently depends on a legacy id existing.',
    ).toEqual([]);
  });
});
