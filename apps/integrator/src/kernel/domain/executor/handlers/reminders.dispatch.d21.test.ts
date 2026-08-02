import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  Action,
  DbReadPort,
  DbWriteMutation,
  DbWritePort,
  DomainContext,
} from '../../../contracts/index.js';
import type { DueReminderOccurrence, ReminderRuleRecord } from '../../../contracts/reminders.js';
import type { DeliveryTargetsFetchResult } from '../../../contracts/notificationChannels.js';

const { enqueue } = vi.hoisted(() => ({
  enqueue: vi.fn(async (_db: unknown, _input: { eventId: string }) => true),
}));

vi.mock('../../../../infra/db/client.js', () => ({
  createDbPort: () => ({ query: vi.fn(), tx: vi.fn() }),
}));
vi.mock('../../../../infra/db/repos/outgoingDeliveryQueue.js', () => ({
  enqueueOutgoingDeliveryIfAbsent: enqueue,
}));
vi.mock('../../../../infra/db/repos/notificationDeliveryAttempts.js', () => ({
  recordMessengerChannelSkipsBestEffort: vi.fn(),
  recordMessengerNotEnqueuedSkipsBestEffort: vi.fn(),
}));

import { handleReminders } from './reminders.js';

const ORG = 'd0000000-0000-4000-8000-00000000000d';
const PLATFORM_USER = 'a0000000-0000-4000-8000-00000000000a';

function context(): DomainContext {
  return {
    event: {
      type: 'schedule.tick',
      meta: { eventId: 'tick-d21', occurredAt: '2026-08-02T12:00:00.000Z', source: 'scheduler' },
      payload: {},
    },
    nowIso: '2026-08-02T12:00:00.000Z',
    values: {},
    base: { actor: { isAdmin: false }, identityLinks: [] },
  };
}

const action: Action = {
  id: 'dispatch-d21',
  type: 'reminders.dispatchDue',
  mode: 'sync',
  params: { nowIso: '2026-08-02T12:00:00.000Z' },
};

function occurrence(overrides: Partial<DueReminderOccurrence> = {}): DueReminderOccurrence {
  return {
    id: 'occ-d21',
    ruleId: 'rule-d21',
    occurrenceKey: 'rule-d21:2026-08-02T12:00:00.000Z',
    plannedAt: '2026-08-02T12:00:00.000Z',
    status: 'planned',
    platformUserId: PLATFORM_USER,
    deliveryGeneration: 3,
    userId: null,
    category: 'warmup',
    timezone: 'Europe/Moscow',
    channelId: '',
    chatId: 0,
    organizationId: ORG,
    ...overrides,
  };
}

const rule: ReminderRuleRecord = {
  id: 'rule-d21',
  userId: null,
  platformUserId: PLATFORM_USER,
  category: 'warmup',
  isEnabled: true,
  scheduleType: 'interval_window',
  timezone: 'Europe/Moscow',
  intervalMinutes: 60,
  windowStartMinute: 0,
  windowEndMinute: 1440,
  daysMask: '1111111',
  contentMode: 'none',
  customTitle: 'Разминка',
  customText: 'Пора размяться',
  notificationTopicCode: 'warmup_reminders',
  organizationId: ORG,
};

function ports(
  items: DueReminderOccurrence[],
  selectedChannels: Array<'telegram' | 'max' | 'web_push' | 'email'> = ['web_push'],
  emailRecipient?: string,
) {
  const writes: DbWriteMutation[] = [];
  const readPort: DbReadPort = {
    readDb: async <T>(query: Parameters<DbReadPort['readDb']>[0]): Promise<T> => {
      if (query.type === 'reminders.occurrences.due') return items as T;
      if (query.type === 'reminders.rule.byId') return rule as T;
      if (query.type === 'reminders.delivery.staleMessengerMessage') return null as T;
      if (query.type === 'reminders.rules.forUser') return [rule] as T;
      if (query.type === 'identities.allByUserId') return [] as T;
      throw new Error(`unexpected read ${query.type}`);
    },
  };
  const writePort: DbWritePort = {
    async writeDb(mutation) {
      writes.push(mutation);
    },
  };
  return {
    readPort,
    writePort,
    writes,
    deliveryTargetsPort: {
      getTargetsByPhone: vi.fn(async () => null),
      getTargetsByChannelBinding: vi.fn(async () => null),
      getTargetsByPlatformUser: vi.fn(async (): Promise<DeliveryTargetsFetchResult> => ({
        channelBindings: {},
        ...(emailRecipient ? { emailRecipient } : {}),
        resolution: {
          userId: PLATFORM_USER,
          topicCode: 'warmup_reminders',
          selectedChannels,
          skippedChannels: [],
          availableChannels: selectedChannels,
          enabledChannels: selectedChannels,
        },
      })),
    },
  };
}

describe('D21 unified reminder dispatcher', () => {
  beforeEach(() => enqueue.mockClear());

  it('plans one canonical occurrence for a platform-user rule without a bot identity', async () => {
    const writes: DbWriteMutation[] = [];
    const readPort: DbReadPort = {
      readDb: async <T>(query: Parameters<DbReadPort['readDb']>[0]): Promise<T> => {
        if (query.type === 'reminders.rules.enabled') {
          return [
            {
              ...rule,
              userId: null,
              windowStartMinute: 960,
              windowEndMinute: 960,
            },
          ] as T;
        }
        throw new Error(`unexpected read ${query.type}`);
      },
    };
    const writePort: DbWritePort = {
      async writeDb(mutation) {
        writes.push(mutation);
      },
    };

    const result = await handleReminders(
      {
        id: 'plan-d21-no-bot',
        type: 'reminders.planDue',
        mode: 'sync',
        params: { nowIso: '2026-08-02T12:00:00.000Z' },
      },
      context(),
      { readPort, writePort },
    );

    expect(result.status).toBe('success');
    expect(result.values?.plannedOccurrenceUpserts).toBe(1);
    expect(
      writes.filter((mutation) => mutation.type === 'reminders.occurrence.upsertPlanned'),
    ).toHaveLength(1);
  });

  it('does not suppress a user-selected occurrence through legacy quiet hours', async () => {
    const writes: DbWriteMutation[] = [];
    const readPort: DbReadPort = {
      readDb: async <T>(query: Parameters<DbReadPort['readDb']>[0]): Promise<T> => {
        if (query.type === 'reminders.rules.enabled') {
          return [
            {
              ...rule,
              userId: null,
              windowStartMinute: 960,
              windowEndMinute: 960,
              quietHoursStartMinute: 900,
              quietHoursEndMinute: 1000,
            },
          ] as T;
        }
        throw new Error(`unexpected read ${query.type}`);
      },
    };
    const writePort: DbWritePort = {
      async writeDb(mutation) {
        writes.push(mutation);
      },
    };

    const result = await handleReminders(
      {
        id: 'plan-d21-no-quiet-hours',
        type: 'reminders.planDue',
        mode: 'sync',
        params: { nowIso: '2026-08-02T12:00:00.000Z' },
      },
      context(),
      { readPort, writePort },
    );

    expect(result.values?.plannedOccurrenceUpserts).toBe(1);
    expect(
      writes.filter((mutation) => mutation.type === 'reminders.occurrence.upsertPlanned'),
    ).toHaveLength(1);
  });

  it('queues Web Push for a canonical rule whose user has no bot identity', async () => {
    const deps = ports([occurrence()]);
    const result = await handleReminders(action, context(), deps);
    expect(result.status).toBe('success');
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(deps.deliveryTargetsPort.getTargetsByPlatformUser).toHaveBeenCalledWith({
      platformUserId: PLATFORM_USER,
      topic: 'warmup_reminders',
      organizationId: ORG,
    });
    expect(enqueue).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        eventId: 'rem:occ-d21:g3:web_push',
        kind: 'reminder_dispatch',
        channel: 'web_push',
        payloadJson: expect.objectContaining({
          occurrenceId: 'occ-d21',
          deliveryGeneration: 3,
          channel: 'web_push',
          deliveryLogId: 'rdl:occ-d21:g3:web_push',
        }),
      }),
    );
  });

  it('creates independent generation-aware Telegram and MAX queue legs', async () => {
    const deps = ports([
      occurrence({ userId: '42', chatId: 1001, channelId: '1001' }),
    ], ['telegram', 'max']);
    deps.readPort.readDb = async <T>(query: Parameters<DbReadPort['readDb']>[0]): Promise<T> => {
      if (query.type === 'reminders.occurrences.due') {
        return [occurrence({ userId: '42', chatId: 1001, channelId: '1001' })] as T;
      }
      if (query.type === 'reminders.rules.forUser') return [rule] as T;
      if (query.type === 'identities.allByUserId') {
        return [{ resource: 'max', externalId: 'max-1002', chatId: 1002 }] as T;
      }
      if (query.type === 'reminders.delivery.staleMessengerMessage') return null as T;
      throw new Error(`unexpected read ${query.type}`);
    };
    const result = await handleReminders(action, context(), deps);
    expect(result.status).toBe('success');
    expect(enqueue.mock.calls.map((call) => call[1].eventId).sort()).toEqual([
      'rem:occ-d21:g3:max',
      'rem:occ-d21:g3:telegram',
    ]);
  });

  it('queues verified email as an independent occurrence-generation leg', async () => {
    const deps = ports([occurrence()], ['email'], 'patient@example.test');
    const result = await handleReminders(action, context(), deps);
    expect(result.status).toBe('success');
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        eventId: 'rem:occ-d21:g3:email',
        kind: 'reminder_dispatch',
        channel: 'email',
        payloadJson: expect.objectContaining({
          platformUserId: PLATFORM_USER,
          deliveryLogId: 'rdl:occ-d21:g3:email',
          intent: expect.objectContaining({
            payload: expect.objectContaining({
              recipient: { email: 'patient@example.test' },
              subject: 'Разминка',
              delivery: { channels: ['email'], maxAttempts: 1 },
            }),
          }),
        }),
      }),
    );
  });

  it('does not invent an SMS reminder leg outside the resolver policy', async () => {
    const deps = ports([occurrence()], []);
    const result = await handleReminders(action, context(), deps);
    expect(result.status).toBe('success');
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('does not enqueue email or Web Push when the canonical resolver disables providers', async () => {
    const deps = ports([occurrence()]);
    deps.deliveryTargetsPort.getTargetsByPlatformUser = vi.fn(
      async (): Promise<DeliveryTargetsFetchResult> => ({
      channelBindings: {},
      resolution: {
        userId: PLATFORM_USER,
        topicCode: 'warmup_reminders',
        selectedChannels: [],
        availableChannels: [],
        enabledChannels: [],
        skippedChannels: [
          { channel: 'email', reason: 'provider_disabled' },
          { channel: 'web_push', reason: 'vapid_missing' },
        ],
      },
      }),
    );
    const result = await handleReminders(action, context(), deps);
    expect(result.status).toBe('success');
    expect(enqueue).not.toHaveBeenCalled();
  });
});
