import { describe, expect, it } from 'vitest';
import type {
  Action,
  DbReadPort,
  DbWriteMutation,
  DbWritePort,
  DomainContext,
  RemindersWebappWritesPort,
} from '../../../contracts/index.js';
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
  const skipCalls: Array<{ integratorUserId: string; occurrenceId: string; reason: string | null }> =
    [];
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
  return { mutations, readPort, writePort, remindersWebappWritesPort, skipCalls };
}

describe('D21a: reminders.skip.applyPreset records skip in one step, no reason asked', () => {
  it('marks the occurrence skipped without ever entering a wait-for-reason state', async () => {
    const deps = skipPorts();

    const result = await handleReminders(skipAction(), skipCallbackContext(), deps);

    expect(result.status).toBe('success');
    expect(deps.mutations.map((m) => m.type)).toEqual(['reminders.occurrence.markSkippedLocal']);
    expect(deps.mutations.some((m) => m.type === 'user.state.set')).toBe(false);
    expect(result.values?.conversationState).toBeUndefined();
    expect(deps.skipCalls).toEqual([{ integratorUserId: userId, occurrenceId, reason: null }]);
    // Confirmation is sent in the same result — pressing skip is exactly one action, not a prompt.
    expect(result.intents?.some((i) => i.type === 'message.edit' || i.type === 'message.send')).toBe(
      true,
    );
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

    expect(result.error).not.toBe('CONVERSATION_USER_BLOCKED_SKIP_REASON');
    expect(result.status).toBe('success');
  });
});
