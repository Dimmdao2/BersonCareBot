import { beforeEach, describe, expect, it, vi } from 'vitest';
import { drizzleSqlFragmentToApproximateSql } from '@/infra/db/drizzleSqlDebugText';

const runWebappSqlMock = vi.hoisted(() => vi.fn());
const runWebappTransactionMock = vi.hoisted(() =>
  vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({})),
);

vi.mock('@/infra/db/runWebappSql', () => ({
  getWebappSqlDb: vi.fn(() => ({})),
  runWebappSql: runWebappSqlMock,
  runWebappTransaction: runWebappTransactionMock,
}));

import {
  cancelWebPushOnlyPendingOccurrencesForRule,
  createPgWebPushOnlyRemindersPort,
} from './pgWebPushOnlyReminders';

const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';

function lastApproxSql(): string {
  const fragment = runWebappSqlMock.mock.calls.at(-1)?.[1];
  return drizzleSqlFragmentToApproximateSql(fragment);
}

describe('pgWebPushOnlyReminders (pg SQL)', () => {
  beforeEach(() => {
    runWebappSqlMock.mockClear();
    runWebappTransactionMock.mockClear();
    runWebappSqlMock.mockResolvedValue({ rows: [], rowCount: 0 });
    runWebappTransactionMock.mockImplementation(async (fn) => fn({}));
  });

  it('cancelWebPushOnlyPendingOccurrencesForRule deletes planned and queued rows', async () => {
    runWebappSqlMock.mockResolvedValueOnce({ rows: [], rowCount: 3 });
    const n = await cancelWebPushOnlyPendingOccurrencesForRule('rule-int-1');
    expect(n).toBe(3);
    const sql = lastApproxSql();
    expect(sql).toContain('webapp_reminder_occurrences');
    expect(sql).toContain('planned');
    expect(sql).toContain('queued');
  });

  it('claimDueOccurrences locks only occurrence rows with SKIP LOCKED', async () => {
    runWebappSqlMock
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'occ-id-1',
            organization_id: ORGANIZATION_ID,
            integrator_rule_id: 'rule-1',
            platform_user_id: 'pu-1',
            occurrence_key: 'k1',
            planned_at: '2026-06-05T10:00:00.000Z',
          },
        ],
        rowCount: 1,
      })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });
    const port = createPgWebPushOnlyRemindersPort();
    const claimed = await port.claimDueOccurrences(ORGANIZATION_ID, '2026-06-05T12:00:00.000Z', 5);
    expect(claimed).toHaveLength(1);
    expect(claimed[0]?.id).toBe('occ-id-1');
    expect(runWebappTransactionMock).toHaveBeenCalledTimes(1);
    const resetSql = drizzleSqlFragmentToApproximateSql(runWebappSqlMock.mock.calls[0]?.[1]);
    const selectSql = drizzleSqlFragmentToApproximateSql(runWebappSqlMock.mock.calls[1]?.[1]);
    expect(resetSql).toContain("status = 'planned'");
    expect(resetSql).toContain('organization_id');
    expect(selectSql).toContain('FOR UPDATE OF o SKIP LOCKED');
    expect(selectSql).toContain("status = 'planned'");
    expect(selectSql).toContain('organization_id');
    const updateSql = drizzleSqlFragmentToApproximateSql(runWebappSqlMock.mock.calls[2]?.[1]);
    expect(updateSql).toContain('AND id IN (');
    expect(updateSql).toContain('organization_id');
    expect(updateSql).toContain('::uuid');
    expect(updateSql).not.toContain('::uuid[]');
  });

  it('markOccurrenceSent sets status sent', async () => {
    const port = createPgWebPushOnlyRemindersPort();
    await port.markOccurrenceSent(ORGANIZATION_ID, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    const sql = lastApproxSql();
    expect(sql).toContain("status = 'sent'");
    expect(sql).toContain('sent_at');
    expect(sql).toContain('organization_id');
  });

  it('markOccurrenceFailed truncates error_code and sets failed', async () => {
    const port = createPgWebPushOnlyRemindersPort();
    const longCode = 'x'.repeat(200);
    await port.markOccurrenceFailed(
      ORGANIZATION_ID,
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      longCode,
    );
    const sql = lastApproxSql();
    expect(sql).toContain("status = 'failed'");
    expect(sql).toContain('error_code');
    expect(sql).toContain('organization_id');
  });
});
