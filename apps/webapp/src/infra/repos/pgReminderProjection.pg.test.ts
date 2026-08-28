import { beforeEach, describe, expect, it, vi } from 'vitest';
import { drizzleSqlFragmentToApproximateSql } from '@/infra/db/drizzleSqlDebugText';

const runWebappSqlMock = vi.hoisted(() => vi.fn());
const runWebappNamedRootMock = vi.hoisted(() => vi.fn());
const loadWarmupsMock = vi.hoisted(() => vi.fn().mockResolvedValue([]));
const getPoolMock = vi.hoisted(() => vi.fn(() => ({})));

vi.mock('@/infra/db/client', () => ({
  getPool: getPoolMock,
}));

vi.mock('@/infra/repos/pgWarmupsSectionSlugs', () => ({
  loadWarmupsSectionSlugs: loadWarmupsMock,
}));

vi.mock('@/infra/db/runWebappSql', () => ({
  getWebappSqlDb: vi.fn(() => ({})),
  runWebappNamedRoot: runWebappNamedRootMock,
  runWebappSql: runWebappSqlMock,
}));

import { createPgReminderProjectionPort } from './pgReminderProjection';

function lastApproxSql(): string {
  const fragment = runWebappSqlMock.mock.calls.at(-1)?.[1];
  return drizzleSqlFragmentToApproximateSql(fragment);
}

function lastNamedApproxSql(): string {
  const fragment = runWebappNamedRootMock.mock.calls.at(-1)?.[3];
  return drizzleSqlFragmentToApproximateSql(fragment);
}

describe('createPgReminderProjectionPort (pg SQL)', () => {
  beforeEach(() => {
    runWebappSqlMock.mockClear();
    runWebappNamedRootMock.mockClear();
    loadWarmupsMock.mockClear();
    runWebappSqlMock.mockResolvedValue({ rows: [], rowCount: 0 });
    runWebappNamedRootMock.mockResolvedValue({ rows: [{ inserted: true }], rowCount: 1 });
  });

  it('listRulesByPlatformUserId фильтрует по каноническому platform_user_id, а не по retired id', async () => {
    // арбитр (Track D #987): вернуть сюда `integrator_user_id` — и чтение правил снова уедет на
    // retired numeric identity, которой у канонического пациента может не быть вовсе
    const port = createPgReminderProjectionPort();
    await port.listRulesByPlatformUserId('11111111-1111-4111-8111-111111111111');
    const sql = lastApproxSql();
    expect(sql).toContain('platform_user_id');
    expect(sql).toContain('11111111-1111-4111-8111-111111111111');
    expect(sql).not.toContain('integrator_user_id');
  });

  it('listHistoryByPlatformUserId фильтрует историю по каноническому platform_user_id', async () => {
    runWebappSqlMock.mockResolvedValueOnce({
      rows: [
        {
          integrator_occurrence_id: 'occ-a',
          integrator_rule_id: 'rule-a',
          status: 'sent',
          delivery_channel: null,
          error_code: null,
          occurred_at: '2026-01-01T00:00:00.000Z',
        },
      ],
      rowCount: 1,
    });
    const port = createPgReminderProjectionPort();
    const list = await port.listHistoryByPlatformUserId(
      '22222222-2222-4222-8222-222222222222',
      10,
    );
    expect(list).toHaveLength(1);
    const sql = lastApproxSql();
    expect(sql).toContain('platform_user_id');
    expect(sql).toContain('22222222-2222-4222-8222-222222222222');
    expect(sql).not.toContain('integrator_user_id');
  });

  it('markSeen passes occurrence id array to UPDATE', async () => {
    const port = createPgReminderProjectionPort();
    await port.markSeen('platform-u', ['occ-1', 'occ-2']);
    const sql = lastApproxSql();
    expect(sql).toContain('seen_at');
    expect(sql).toContain('ANY');
    expect(sql).toContain('platform-u');
    expect(sql).toContain('platform_user_id');
    expect(sql).not.toContain('reminder_rules');
  });

  it('does not turn an unseen-count database denial into a false zero', async () => {
    runWebappSqlMock.mockRejectedValueOnce(new Error('permission denied'));
    const port = createPgReminderProjectionPort();
    await expect(port.getUnseenCount('platform-u')).rejects.toThrow('permission denied');
  });

  it('does not turn a reminder-stats database denial into false empty stats', async () => {
    runWebappSqlMock.mockRejectedValueOnce(new Error('permission denied'));
    const port = createPgReminderProjectionPort();
    await expect(port.getStats('platform-u', 30)).rejects.toThrow('permission denied');
  });
});
