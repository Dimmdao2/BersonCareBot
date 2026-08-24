import { beforeEach, describe, expect, it, vi } from 'vitest';
import { drizzleSqlFragmentToApproximateSql } from '@/infra/db/drizzleSqlDebugText';

const runWebappSqlMock = vi.hoisted(() => vi.fn());
const runWebappNamedRootMock = vi.hoisted(() => vi.fn());
const findCanonicalMock = vi.hoisted(() => vi.fn());
const loadWarmupsMock = vi.hoisted(() => vi.fn().mockResolvedValue([]));
const getPoolMock = vi.hoisted(() => vi.fn(() => ({})));

vi.mock('@/infra/db/client', () => ({
  getPool: getPoolMock,
}));

vi.mock('@/infra/repos/pgCanonicalPlatformUser', () => ({
  findCanonicalUserIdByIntegratorId: findCanonicalMock,
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
    findCanonicalMock.mockClear();
    loadWarmupsMock.mockClear();
    runWebappSqlMock.mockResolvedValue({ rows: [], rowCount: 0 });
    runWebappNamedRootMock.mockResolvedValue({ rows: [{ inserted: true }], rowCount: 1 });
    findCanonicalMock.mockResolvedValue('platform-uuid-canonical');
  });

  it('upsertRuleFromProjection resolves platform_user_id via canonical lookup (integrator_user_id preserved)', async () => {
    const port = createPgReminderProjectionPort();
    await port.upsertRuleFromProjection({
      integratorRuleId: 'rule-1',
      integratorUserId: '42',
      category: 'exercise',
      isEnabled: true,
      scheduleType: 'daily',
      timezone: 'Europe/Moscow',
      intervalMinutes: 60,
      windowStartMinute: 0,
      windowEndMinute: 1440,
      daysMask: '1111111',
      contentMode: 'none',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    expect(findCanonicalMock).toHaveBeenCalledWith(expect.anything(), '42');
    const sql = lastApproxSql();
    expect(sql).toContain('INSERT INTO reminder_rules');
    expect(sql).toContain('integrator_user_id');
    expect(sql).toContain('ON CONFLICT (integrator_rule_id)');
    expect(sql).toContain('platform-uuid-canonical');
  });

  it('upsertRuleFromProjection skips canonical lookup when integratorUserId is empty', async () => {
    const port = createPgReminderProjectionPort();
    await port.upsertRuleFromProjection({
      integratorRuleId: 'rule-empty',
      integratorUserId: '',
      category: 'exercise',
      isEnabled: true,
      scheduleType: 'daily',
      timezone: 'Europe/Moscow',
      intervalMinutes: 60,
      windowStartMinute: 0,
      windowEndMinute: 1440,
      daysMask: '1111111',
      contentMode: 'none',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    expect(findCanonicalMock).not.toHaveBeenCalled();
  });

  it('listHistoryByIntegratorUserId filters by integrator_user_id (no canonical rewrite)', async () => {
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
    const list = await port.listHistoryByIntegratorUserId('77', 10);
    expect(list).toHaveLength(1);
    expect(findCanonicalMock).not.toHaveBeenCalled();
    const sql = lastApproxSql();
    expect(sql).toContain('integrator_user_id');
    expect(sql).toContain('77');
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
