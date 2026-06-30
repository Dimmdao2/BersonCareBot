/**
 * B-5 — reminder channel filter: selectedChannels applied unconditionally
 *
 * When a DeliveryTargetsFetchResult resolution exists, selectedChannels must gate which
 * messenger channels actually receive the reminder — even when bindings are empty
 * (i.e., hasResolvedTopicBindings is false).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Action, DomainContext } from '../../../contracts/index.js';
import type { DueReminderOccurrence, ReminderRuleRecord } from '../../../contracts/reminders.js';
import type { ExecutorDeps } from '../helpers.js';
import type { DeliveryTargetsFetchResult } from '../../../contracts/notificationChannels.js';
import { handleReminders } from './reminders.js';

// ── DB / infra mocks ────────────────────────────────────────────────────────

const dbQueryMock = vi.fn();
vi.mock('../../../../infra/db/client.js', () => ({
  createDbPort: () => ({ query: (...args: unknown[]) => dbQueryMock(...args) }),
}));

vi.mock('../../../../infra/db/repos/reminders.js', () => ({
  expireOrphanedPendingReminderOccurrences: vi.fn(async () => ({ expired: 0 })),
}));

const enqueueOutgoingMock = vi.fn();
vi.mock('../../../../infra/db/repos/outgoingDeliveryQueue.js', () => ({
  enqueueOutgoingDeliveryIfAbsent: (db: unknown, opts: unknown) => enqueueOutgoingMock(db, opts),
}));

vi.mock('../../../../infra/db/repos/notificationDeliveryAttempts.js', () => ({
  recordMessengerChannelSkipsBestEffort: vi.fn(async () => {}),
  recordMessengerNotEnqueuedSkipsBestEffort: vi.fn(async () => {}),
}));

vi.mock('../../../../config/appTimezone.js', () => ({
  getAppDisplayTimezone: vi.fn(async () => 'Europe/Moscow'),
}));

vi.mock('../../../../config/appBaseUrl.js', () => ({
  getAppBaseUrl: vi.fn(async () => 'https://app.example'),
  getAppBaseUrlSync: vi.fn(() => 'https://app.example'),
}));

vi.mock('../../../../integrations/max/maxRecipient.js', () => ({
  maxBindingRecipient: vi.fn((externalId: string, chatId: number) => ({ externalId, chatId })),
}));

vi.mock('../../reminders/reminderMessengerWebAppUrls.js', () => ({
  buildExerciseReminderWebAppUrls: vi.fn(async () => ({
    webAppUrl: 'https://app.example/app?t=tg',
    remindersEditUrl: 'https://app.example/app/patient/reminders?from=reminder',
    mobileAppWebAppUrl: null,
  })),
}));

vi.mock('../../reminders/reminderInlineKeyboard.js', () => ({
  buildReminderDispatchInlineKeyboard: vi.fn(() => ({ inline_keyboard: [] })),
  buildReminderSkipReasonInlineKeyboard: vi.fn(() => ({ inline_keyboard: [] })),
  reminderIntentPrimaryLabel: vi.fn(() => 'Открыть'),
  reminderLinkKeyboardButton: vi.fn(() => ({ text: 'Открыть', url: 'https://app.example' })),
  isTelegramCallbackDataWithinLimit: vi.fn(() => true),
  telegramCallbackDataUtf8Bytes: vi.fn(() => 10),
  TELEGRAM_CALLBACK_DATA_MAX_BYTES: 64,
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeAction(): Action {
  return {
    id: 'test-dispatch-1',
    type: 'reminders.dispatchDue',
    mode: 'sync',
    params: { nowIso: '2026-06-19T10:00:00.000Z', limit: 10 },
  };
}

function makeCtx(): DomainContext {
  return {
    nowIso: '2026-06-19T10:00:00.000Z',
    values: {},
    base: { actor: { isAdmin: false }, identityLinks: [] },
    event: {
      type: 'schedule.tick',
      meta: { eventId: 'sch-1', occurredAt: '2026-06-19T10:00:00.000Z', source: 'scheduler' },
      payload: {},
    },
  };
}

const BASE_RULE: ReminderRuleRecord = {
  id: 'rule-1',
  userId: 'user-1',
  category: 'exercise',
  isEnabled: true,
  scheduleType: 'interval_window',
  timezone: 'Europe/Moscow',
  intervalMinutes: 60,
  windowStartMinute: 480,
  windowEndMinute: 1200,
  daysMask: '1111111',
  contentMode: 'none',
  reminderIntent: 'exercises',
  notificationTopicCode: 'training_reminders',
};

const BASE_OCC: DueReminderOccurrence = {
  id: 'occ-1',
  ruleId: 'rule-1',
  occurrenceKey: 'occ-key-1',
  plannedAt: '2026-06-19T10:00:00.000Z',
  status: 'planned',
  userId: 'user-1',
  category: 'exercise',
  timezone: 'Europe/Moscow',
  channelId: 'ch-1',
  chatId: 111111,
};

interface MockReadPortOverrides {
  dueList?: DueReminderOccurrence[] | undefined;
  rules?: ReminderRuleRecord[] | undefined;
  identities?: Array<{ resource: string; externalId: string; chatId: number }> | undefined;
  staleMessage?: string | null | undefined;
}

function makeReadPortMock(overrides: MockReadPortOverrides = {}) {
  const dueList = overrides.dueList ?? [BASE_OCC];
  const rules = overrides.rules ?? [BASE_RULE];
  const identities = overrides.identities ?? [];
  return {
    readDb: vi.fn(async (req: { type: string; params: Record<string, unknown> }) => {
      if (req.type === 'reminders.occurrences.due') return dueList;
      if (req.type === 'reminders.rules.forUser') return rules;
      if (req.type === 'identities.allByUserId') return identities;
      if (req.type === 'reminders.delivery.staleMessengerMessage') return overrides.staleMessage ?? null;
      return null;
    }),
  };
}

function makeWritePortMock() {
  return { writeDb: vi.fn(async () => ({ ok: true })) };
}

interface MakeDepsOverrides {
  dueList?: DueReminderOccurrence[];
  rules?: ReminderRuleRecord[];
  identities?: Array<{ resource: string; externalId: string; chatId: number }>;
  deliveryTargetsPort?: ExecutorDeps['deliveryTargetsPort'];
}

function makeDeps(overrides: MakeDepsOverrides = {}): ExecutorDeps {
  return {
    readPort: makeReadPortMock({
      dueList: overrides.dueList,
      rules: overrides.rules,
      identities: overrides.identities,
    }) as unknown as ExecutorDeps['readPort'],
    writePort: makeWritePortMock() as unknown as ExecutorDeps['writePort'],
    deliveryTargetsPort: overrides.deliveryTargetsPort,
  } as unknown as ExecutorDeps;
}

function makeDeliveryTargetsPort(
  result: DeliveryTargetsFetchResult | null,
): ExecutorDeps['deliveryTargetsPort'] {
  return {
    getTargetsByPhone: vi.fn(async () => null),
    getTargetsByChannelBinding: vi.fn(async () => result),
  };
}

/** Extract the channel from each enqueue call (2nd argument). */
function enqueuedChannels(): string[] {
  return enqueueOutgoingMock.mock.calls.map(
    (call) => (call[1] as { channel: string }).channel,
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('B-5: reminder channel filter — selectedChannels applied unconditionally', () => {
  beforeEach(() => {
    dbQueryMock.mockReset();
    enqueueOutgoingMock.mockReset();
    enqueueOutgoingMock.mockResolvedValue({ inserted: true });
    // Default DB response for batch enqueue
    dbQueryMock.mockResolvedValue({ rows: [], rowCount: 0 });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends to telegram when selectedChannels includes telegram (baseline)', async () => {
    const deliveryTargetsPort = makeDeliveryTargetsPort({
      channelBindings: { telegramId: '111111' },
      resolution: {
        userId: 'webapp-user-1',
        topicCode: 'training_reminders',
        selectedChannels: ['telegram'],
        skippedChannels: [],
        availableChannels: ['telegram'],
        enabledChannels: ['telegram'],
      },
    });

    const result = await handleReminders(makeAction(), makeCtx(), makeDeps({ deliveryTargetsPort }));

    expect(result.status).toBe('success');
    // telegram channel was selected → one enqueue for telegram
    expect(enqueuedChannels()).toContain('telegram');
  });

  it('sends nothing when selectedChannels is empty (all messengers OFF)', async () => {
    // channelBindings empty → hasResolvedTopicBindings = false (OLD code would skip filter)
    // selectedChannels = [] → NEW code must filter sendChannels to []
    const deliveryTargetsPort = makeDeliveryTargetsPort({
      channelBindings: {}, // empty: no telegramId, no maxId
      resolution: {
        userId: 'webapp-user-1',
        topicCode: 'training_reminders',
        selectedChannels: [], // all messenger channels disabled
        skippedChannels: [{ channel: 'telegram', reason: 'disabled_by_user_topic_channel' }],
        availableChannels: ['telegram'],
        enabledChannels: [],
      },
    });

    const result = await handleReminders(makeAction(), makeCtx(), makeDeps({ deliveryTargetsPort }));

    expect(result.status).toBe('success');
    // No enqueue must have happened for any messenger channel
    expect(enqueuedChannels()).not.toContain('telegram');
    expect(enqueuedChannels()).not.toContain('max');
    expect(enqueuedChannels()).toHaveLength(0);
  });

  it('sends only to telegram when max is disabled in selectedChannels (partial disable)', async () => {
    const MAX_CHAT_ID = 222222;
    const MAX_EXTERNAL_ID = 'max-ext-id-1';

    const identities = [
      { resource: 'max', externalId: MAX_EXTERNAL_ID, chatId: MAX_CHAT_ID },
    ];

    const deliveryTargetsPort = makeDeliveryTargetsPort({
      channelBindings: { telegramId: '111111', maxId: MAX_EXTERNAL_ID },
      resolution: {
        userId: 'webapp-user-1',
        topicCode: 'training_reminders',
        // Only telegram selected; max is disabled
        selectedChannels: ['telegram'],
        skippedChannels: [{ channel: 'max', reason: 'disabled_by_user_topic_channel' }],
        availableChannels: ['telegram', 'max'],
        enabledChannels: ['telegram'],
      },
    });

    const result = await handleReminders(
      makeAction(),
      makeCtx(),
      makeDeps({ deliveryTargetsPort, identities }),
    );

    expect(result.status).toBe('success');
    const channels = enqueuedChannels();
    // telegram must be enqueued, max must NOT
    expect(channels).toContain('telegram');
    expect(channels).not.toContain('max');
  });

  it('sends nothing when selectedChannels omits telegram even though occ.chatId is set', async () => {
    // Bug scenario: occ has chatId (would normally add telegram to channelsToSend),
    // but selectedChannels is missing 'telegram'. Must not send.
    const deliveryTargetsPort = makeDeliveryTargetsPort({
      channelBindings: {}, // no bindings
      resolution: {
        userId: 'webapp-user-1',
        topicCode: 'training_reminders',
        selectedChannels: [],
        skippedChannels: [{ channel: 'telegram', reason: 'topic_disabled' }],
        availableChannels: [],
        enabledChannels: [],
      },
    });

    await handleReminders(makeAction(), makeCtx(), makeDeps({ deliveryTargetsPort }));

    expect(enqueuedChannels()).toHaveLength(0);
  });
});
