import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Action, DbReadPort, DbReadQuery, DomainContext } from '../../../contracts/index.js';
import type { DueReminderOccurrence, ReminderRuleRecord } from '../../../contracts/reminders.js';
import { getCurrentOrganizationPrincipalId } from '../../../../infra/principal/organizationPrincipal.js';
import { handleReminders } from './reminders.js';

vi.mock('../../../../infra/db/client.js', () => ({
  createDbPort: () => ({ query: vi.fn() }),
}));

vi.mock('../../../../infra/db/repos/reminders.js', () => ({
  expireOrphanedPendingReminderOccurrences: vi.fn(async () => undefined),
}));

const recordMessengerChannelSkipsBestEffortMock = vi.fn(async (
  _db: unknown,
  _input: Record<string, unknown>,
) => undefined);
const recordMessengerNotEnqueuedSkipsBestEffortMock = vi.fn(async (
  _db: unknown,
  _input: Record<string, unknown>,
) => undefined);
vi.mock('../../../../infra/db/repos/notificationDeliveryAttempts.js', () => ({
  recordMessengerChannelSkipsBestEffort: (
    db: unknown,
    input: Record<string, unknown>,
  ) => recordMessengerChannelSkipsBestEffortMock(db, input),
  recordMessengerNotEnqueuedSkipsBestEffort: (
    db: unknown,
    input: Record<string, unknown>,
  ) => recordMessengerNotEnqueuedSkipsBestEffortMock(db, input),
}));

vi.mock('../../../../infra/db/repos/outgoingDeliveryQueue.js', () => ({
  enqueueOutgoingDeliveryIfAbsent: vi.fn(async () => undefined),
}));

vi.mock('../../../../config/appTimezone.js', () => ({
  getAppDisplayTimezone: vi.fn(async () => 'Europe/Moscow'),
}));

vi.mock('../../../../config/appBaseUrl.js', () => ({
  getAppBaseUrl: vi.fn(async () => 'https://app.example'),
  getAppBaseUrlSync: vi.fn(() => 'https://app.example'),
}));

function makeCtx(): DomainContext {
  return {
    nowIso: '2026-03-05T10:00:00.000Z',
    values: {},
    base: { actor: { isAdmin: false }, identityLinks: [] },
    event: {
      type: 'schedule.tick',
      meta: { eventId: 'sch-tenant', occurredAt: '2026-03-05T10:00:00.000Z', source: 'scheduler' },
      payload: {},
    },
  };
}

function makeRule(organizationId?: string | null): ReminderRuleRecord {
  return {
    id: organizationId ? 'rule-org' : 'rule-no-org',
    userId: '42',
    category: 'exercise',
    isEnabled: true,
    scheduleType: 'interval_window',
    timezone: 'Europe/Moscow',
    intervalMinutes: 1440,
    windowStartMinute: 841,
    windowEndMinute: 841,
    daysMask: '1111111',
    contentMode: 'none',
    reminderIntent: 'exercises',
    ...(organizationId !== undefined ? { organizationId } : {}),
  };
}

describe('reminders tenant context for scheduler writers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('runs planDue occurrence writes under the rule organization when present', async () => {
    const organizationId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const contexts: Array<string | undefined> = [];
    const writeDb = vi.fn(async () => {
      contexts.push(getCurrentOrganizationPrincipalId());
    });
    const readDb: DbReadPort['readDb'] = async <T = unknown>(query: DbReadQuery): Promise<T> => {
      if (query.type === 'reminders.rules.enabled') return [makeRule(organizationId)] as T;
      return [] as T;
    };
    const action: Action = {
      id: 'plan-due',
      type: 'reminders.planDue',
      mode: 'sync',
      params: { nowIso: '2026-03-05T10:00:00.000Z' },
    };

    const result = await handleReminders(action, makeCtx(), {
      readPort: { readDb },
      writePort: { writeDb },
    });

    expect(result.status).toBe('success');
    expect(contexts).toEqual([organizationId]);
  });

  it('leaves planDue occurrence writes unscoped when the rule has no organization source', async () => {
    const contexts: Array<string | undefined> = [];
    const writeDb = vi.fn(async () => {
      contexts.push(getCurrentOrganizationPrincipalId());
    });
    const readDb: DbReadPort['readDb'] = async <T = unknown>(query: DbReadQuery): Promise<T> => {
      if (query.type === 'reminders.rules.enabled') return [makeRule()] as T;
      return [] as T;
    };
    const action: Action = {
      id: 'plan-due-no-org',
      type: 'reminders.planDue',
      mode: 'sync',
      params: { nowIso: '2026-03-05T10:00:00.000Z' },
    };

    await handleReminders(action, makeCtx(), {
      readPort: { readDb },
      writePort: { writeDb },
    });

    expect(contexts).toEqual([undefined]);
  });

  it('runs dispatchDue queued writes and skip attempts under the occurrence organization', async () => {
    const organizationId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const occurrence: DueReminderOccurrence = {
      id: 'occ-org',
      ruleId: 'rule-org',
      occurrenceKey: 'occ-org-key',
      plannedAt: '2026-03-05T09:55:00.000Z',
      status: 'planned',
      userId: '42',
      category: 'exercise',
      timezone: 'Europe/Moscow',
      channelId: '',
      chatId: 0,
      organizationId,
    };
    const contexts: Array<string | undefined> = [];
    const writeDb = vi.fn(async () => {
      contexts.push(getCurrentOrganizationPrincipalId());
    });
    const readDb: DbReadPort['readDb'] = async <T = unknown>(query: DbReadQuery): Promise<T> => {
      if (query.type === 'reminders.occurrences.due') return [occurrence] as T;
      if (query.type === 'reminders.rules.forUser') {
        return [{ ...makeRule(organizationId), id: 'rule-org', userId: '42' }] as T;
      }
      if (query.type === 'identities.allByUserId') return [] as T;
      return null as T;
    };
    const action: Action = {
      id: 'dispatch-due',
      type: 'reminders.dispatchDue',
      mode: 'sync',
      params: { nowIso: '2026-03-05T10:00:00.000Z', limit: 10 },
    };

    await handleReminders(action, makeCtx(), {
      readPort: { readDb },
      writePort: { writeDb },
    });

    expect(contexts).toEqual([organizationId]);
    expect(recordMessengerNotEnqueuedSkipsBestEffortMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ organizationId }),
    );
  });
});
