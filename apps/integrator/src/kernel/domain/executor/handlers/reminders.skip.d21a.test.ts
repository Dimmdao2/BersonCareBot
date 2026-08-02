import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type {
  Action,
  BaseContext,
  DbReadPort,
  DbWriteMutation,
  DbWritePort,
  DomainContext,
  OrchestratorInput,
  RemindersWebappWritesPort,
} from '../../../contracts/index.js';
import { createContentPort } from '../../../../infra/adapters/contentPort.js';
import { createTemplatePort } from '../../../../infra/adapters/templatePort.js';
import { buildPlan } from '../../../orchestrator/resolver.js';
import { buildReminderDispatchInlineKeyboard } from '../../reminders/reminderInlineKeyboard.js';
import { incomingCallbackUpdateFromTelegramCallbackQuery } from '../../../../integrations/telegram/mapIn.js';
import { fromMax } from '../../../../integrations/max/mapIn.js';
import { executeAction } from '../executeAction.js';
import { handleReminders } from './reminders.js';
import { handleConversationUserMessage } from './supportRelay.js';

const occurrenceId = '33333333-3333-4333-8333-333333333333';
const userId = '22222222-2222-4222-8222-222222222222';

function skipCallbackContext(): DomainContext {
  return {
    event: {
      type: 'callback.received',
      meta: {
        eventId: 'event-skip-1',
        occurredAt: '2026-07-31T09:00:00.000Z',
        source: 'telegram',
      },
      payload: {
        incoming: { chatId: 7001, messageId: 55, callbackQueryId: 'cbq-1' },
      },
    },
    nowIso: '2026-07-31T09:00:00.000Z',
    values: {},
    base: { actor: { isAdmin: false }, identityLinks: [] },
  };
}

function skipAction(): Action {
  return {
    id: 'skip-1',
    type: 'reminders.skip.applyPreset',
    mode: 'sync',
    params: {
      occurrenceId,
      channelUserId: '7001',
      resource: 'telegram',
      chatId: 7001,
      messageId: 55,
      callbackQueryId: 'cbq-1',
    },
  };
}

function skipPorts() {
  const mutations: DbWriteMutation[] = [];
  const readPort: DbReadPort = {
    readDb: async <T>(query: Parameters<DbReadPort['readDb']>[0]): Promise<T> => {
      if (query.type === 'user.byIdentity') return { userId } as T;
      if (query.type === 'reminders.occurrence.ownerUserId') return userId as T;
      throw new Error(`unexpected read: ${query.type}`);
    },
  };
  const writePort: DbWritePort = {
    writeDb: async (mutation) => {
      mutations.push(mutation);
    },
  };
  const skipCalls: Array<{ occurrenceId: string; reason: string | null }> = [];
  const remindersWebappWritesPort: RemindersWebappWritesPort = {
    postOccurrenceSnooze: async () => ({ ok: false, error: 'not used' }),
    postOccurrenceSkip: async (input) => {
      skipCalls.push(input);
      return { ok: true, skippedAt: '2026-07-31T09:00:01.000Z' };
    },
    postOccurrenceDone: async () => ({ ok: false, error: 'not used' }),
    postReminderMuteUntil: async () => ({ ok: false, error: 'not used' }),
    postMessengerTopicDisable: async () => ({ ok: false, error: 'not used' }),
    getNotificationSettings: async () => ({ ok: false, error: 'not used' }),
    toggleNotificationTopic: async () => ({ ok: false, error: 'not used' }),
  };
  return {
    mutations,
    readPort,
    writePort,
    remindersWebappWritesPort,
    skipCalls,
    templatePort: {
      renderTemplate: async () => ({ text: 'ready canonical copy' }),
    },
  };
}

describe('D21a: reminders.skip.applyPreset records skip in one step, no reason asked', () => {
  it('marks the occurrence skipped without ever entering a wait-for-reason state', async () => {
    const deps = skipPorts();

    const result = await handleReminders(skipAction(), skipCallbackContext(), deps);

    expect(result.status).toBe('success');
    expect(deps.mutations).toEqual([]);
    expect(deps.mutations.some((m) => m.type === 'user.state.set')).toBe(false);
    expect(result.values?.conversationState).toBeUndefined();
    expect(deps.skipCalls).toEqual([{ occurrenceId, reason: null }]);
    // Confirmation is sent in the same result — pressing skip is exactly one action, not a prompt.
    expect(
      result.intents?.some((i) => i.type === 'message.edit' || i.type === 'message.send'),
    ).toBe(true);
  });
});

describe('D21a: no dead skip-reason state can swallow the next message', () => {
  it('relays a message sent while conversationState carries a stale waiting_skip_reason value', async () => {
    const ctx: DomainContext = {
      event: {
        type: 'message.received',
        meta: {
          eventId: 'event-after-skip-1',
          occurredAt: '2026-07-31T09:01:00.000Z',
          source: 'telegram',
          userId: '7001',
        },
        payload: { incoming: { chatId: 7001, messageId: 56, text: 'Было очень больно' } },
      },
      nowIso: '2026-07-31T09:01:00.000Z',
      values: {},
      base: {
        actor: { isAdmin: false },
        identityLinks: [],
        facts: { adminChatId: 9001 },
        // Legacy value a stale row could still carry; the state itself is never written anymore (D21a).
        conversationState: `waiting_skip_reason:${occurrenceId}`,
      },
    };
    const readPort: DbReadPort = {
      readDb: async <T>(query: Parameters<DbReadPort['readDb']>[0]): Promise<T> => {
        if (query.type === 'conversation.openByIdentity') {
          return { id: 'legacy-conversation', first_name: 'Иван' } as T;
        }
        if (query.type === 'platformUser.idByChannelBinding') {
          return userId as T;
        }
        throw new Error(`unexpected read: ${query.type}`);
      },
    };
    const writePort: DbWritePort = { writeDb: async () => {} };
    const action: Action = {
      id: 'relay-after-skip',
      type: 'conversation.user.message',
      mode: 'sync',
      params: { source: 'telegram' },
    };

    const result = await handleConversationUserMessage(action, ctx, {
      readPort,
      writePort,
      webappEventsPort: {
        emit: async () => ({ ok: true, status: 200 }),
        syncSupportUserMessage: async () => ({ ok: true, status: 200 }),
      },
    });

    // D21A_AUDIT.md F3: an assertion pinning the removed `CONVERSATION_USER_BLOCKED_SKIP_REASON`
    // string can never go red (the string no longer exists anywhere in source) — the status check
    // below is what actually proves the message reaches support instead of being swallowed.
    expect(result.status).toBe('success');
  });
});

describe('D21a: skip guards occurrence ownership (D21A_AUDIT.md F5)', () => {
  it('refuses to skip an occurrence owned by a different user', async () => {
    const otherOwnerUserId = '77777777-7777-4777-8777-777777777777';
    const mutations: DbWriteMutation[] = [];
    const skipCalls: Array<{ occurrenceId: string; reason: string | null }> = [];
    const readPort: DbReadPort = {
      readDb: async <T>(query: Parameters<DbReadPort['readDb']>[0]): Promise<T> => {
        if (query.type === 'user.byIdentity') return { userId } as T;
        // Occurrence belongs to someone else — the actor pressing "Пропустить" is not the owner.
        if (query.type === 'reminders.occurrence.ownerUserId') return otherOwnerUserId as T;
        throw new Error(`unexpected read: ${query.type}`);
      },
    };
    const writePort: DbWritePort = {
      writeDb: async (mutation) => {
        mutations.push(mutation);
      },
    };
    const remindersWebappWritesPort: RemindersWebappWritesPort = {
      postOccurrenceSnooze: async () => ({ ok: false, error: 'not used' }),
      postOccurrenceSkip: async (input) => {
        skipCalls.push(input);
        return { ok: true, skippedAt: '2026-07-31T09:00:01.000Z' };
      },
      postOccurrenceDone: async () => ({ ok: false, error: 'not used' }),
      postReminderMuteUntil: async () => ({ ok: false, error: 'not used' }),
      postMessengerTopicDisable: async () => ({ ok: false, error: 'not used' }),
      getNotificationSettings: async () => ({ ok: false, error: 'not used' }),
      toggleNotificationTopic: async () => ({ ok: false, error: 'not used' }),
    };

    const result = await handleReminders(skipAction(), skipCallbackContext(), {
      readPort,
      writePort,
      remindersWebappWritesPort,
    });

    expect(result.status).toBe('failed');
    expect(mutations).toEqual([]);
    expect(skipCalls).toEqual([]);
  });
});

describe('D21a: skip button survives the routing layer — content scripts, mapIn, action registry (D21A_AUDIT.md F1+F2)', () => {
  const routingOccurrenceId = '88888888-8888-4888-8888-888888888888';
  const routingUserId = '99999999-9999-4999-8999-999999999999';

  /** Reads the callback_data literal off the real keyboard builder — not hand-typed — so a drift
   * between the button and `normalizeChannelCallbackPayload` (D21A_AUDIT.md F2) fails this test too. */
  function skipButtonCallbackData(): string {
    const { inline_keyboard } = buildReminderDispatchInlineKeyboard({
      primaryLabel: 'Начать тренировку',
      primaryUrl: 'https://app.example.test/lfk',
      scheduleUrl: 'https://app.example.test/schedule',
      occurrenceId: routingOccurrenceId,
    });
    for (const row of inline_keyboard) {
      for (const button of row) {
        if ('callback_data' in button && button.text === 'Пропущу') return button.callback_data;
      }
    }
    throw new Error('skip button missing from real dispatch keyboard markup');
  }

  function routingExecutorDeps(contentPort: ReturnType<typeof createContentPort>) {
    const templatePort = createTemplatePort({ contentPort });
    const mutations: DbWriteMutation[] = [];
    const skipCalls: Array<{ occurrenceId: string; reason: string | null }> = [];
    const readPort: DbReadPort = {
      readDb: async <T>(query: Parameters<DbReadPort['readDb']>[0]): Promise<T> => {
        if (query.type === 'user.byIdentity') return { userId: routingUserId } as T;
        if (query.type === 'reminders.occurrence.ownerUserId') return routingUserId as T;
        throw new Error(`unexpected read: ${query.type}`);
      },
    };
    const writePort: DbWritePort = {
      writeDb: async (mutation) => {
        mutations.push(mutation);
      },
    };
    const remindersWebappWritesPort: RemindersWebappWritesPort = {
      postOccurrenceSnooze: async () => ({ ok: false, error: 'not used' }),
      postOccurrenceSkip: async (input) => {
        skipCalls.push(input);
        return { ok: true, skippedAt: '2026-07-31T09:00:01.000Z' };
      },
      postOccurrenceDone: async () => ({ ok: false, error: 'not used' }),
      postReminderMuteUntil: async () => ({ ok: false, error: 'not used' }),
      postMessengerTopicDisable: async () => ({ ok: false, error: 'not used' }),
      getNotificationSettings: async () => ({ ok: false, error: 'not used' }),
      toggleNotificationTopic: async () => ({ ok: false, error: 'not used' }),
    };
    return { mutations, skipCalls, readPort, writePort, remindersWebappWritesPort, templatePort };
  }

  const channels: Array<{
    source: 'telegram' | 'max';
    buildIncomingEvent: (callbackData: string) => OrchestratorInput['event'];
  }> = [
    {
      source: 'telegram',
      buildIncomingEvent: (callbackData) => {
        const update = incomingCallbackUpdateFromTelegramCallbackQuery({
          id: 'cbq-routing-tg-1',
          from: { id: 7001 },
          data: callbackData,
          message: { message_id: 55, chat: { id: 7001 } },
        });
        if (!update) throw new Error('telegram callback_query fixture failed to normalize');
        return {
          type: 'callback.received',
          meta: {
            eventId: 'event-routing-skip-tg',
            occurredAt: '2026-07-31T09:00:00.000Z',
            source: 'telegram',
          },
          payload: { incoming: update },
        };
      },
    },
    {
      source: 'max',
      buildIncomingEvent: (callbackData) => {
        const update = fromMax({
          update_type: 'message_callback',
          timestamp: 0,
          callback: {
            callback_id: 'cbq-routing-max-1',
            payload: callbackData,
            user: { user_id: 8001 },
          },
          message: { recipient: { chat_id: 8001 }, body: { mid: 'mid-routing-max-1' } },
        });
        if (!update) throw new Error('max callback fixture failed to normalize');
        return {
          type: 'callback.received',
          meta: {
            eventId: 'event-routing-skip-max',
            occurredAt: '2026-07-31T09:00:00.000Z',
            source: 'max',
          },
          payload: { incoming: update },
        };
      },
    },
  ];

  it.each(channels)(
    '$source: pressing "Пропущу" reaches the handler with no reason code and no wait-for-reason state',
    async ({ buildIncomingEvent }) => {
      const contentPort = createContentPort({
        rootDir: path.resolve(process.cwd(), 'src/content'),
      });
      // linkedPhone: true — bypass buildLinkedPhoneCallbackGatePlan (out of D21a scope, see resolver.ts);
      // without it every unauthenticated callback gets rerouted to the "share your phone" gate plan.
      const base: BaseContext = { actor: { isAdmin: false }, identityLinks: [], linkedPhone: true };
      const event = buildIncomingEvent(skipButtonCallbackData());

      const plan = await buildPlan(
        { event, context: base },
        { contentPort, contextQueryPort: { request: async () => null } },
      );

      // D21A_AUDIT.md I3b: a scenario that re-adds a wait-for-reason transition must fail here,
      // whether or not it also still reaches reminders.skip.applyPreset afterwards.
      expect(plan.some((step) => step.kind === 'user.state.set')).toBe(false);

      const skipStep = plan.find((step) => step.kind === 'reminders.skip.applyPreset');
      expect(
        skipStep,
        `plan never reached reminders.skip.applyPreset — content/mapIn/registry did not route the ` +
          `skip button; got steps: ${JSON.stringify(plan.map((s) => s.kind))}`,
      ).toBeDefined();
      if (!skipStep) return;
      expect(skipStep.payload.occurrenceId).toBe(routingOccurrenceId);
      expect(skipStep.payload.reasonCode).toBeUndefined();

      const deps = routingExecutorDeps(contentPort);
      const domainCtx: DomainContext = {
        event,
        nowIso: '2026-07-31T09:00:00.000Z',
        values: {},
        base,
      };
      const action: Action = {
        id: skipStep.id,
        type: skipStep.kind,
        mode: skipStep.mode,
        params: skipStep.payload,
      };
      const result = await executeAction(action, domainCtx, deps);

      expect(result.status).toBe('success');
      expect(deps.mutations).toEqual([]);
      expect(deps.skipCalls).toEqual([{ occurrenceId: routingOccurrenceId, reason: null }]);
    },
  );
});
