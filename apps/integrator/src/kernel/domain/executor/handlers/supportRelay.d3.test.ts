import { describe, expect, it, vi } from 'vitest';
import type {
  Action,
  DbReadPort,
  DbWriteMutation,
  DbWritePort,
  DomainContext,
  WebappEventsPort,
} from '../../../contracts/index.js';
import { handleConversationUserMessage } from './supportRelay.js';

const canonicalConversationId =
  'webapp:platform:22222222-2222-4222-8222-222222222222';

function context(): DomainContext {
  return {
    event: {
      type: 'message.received',
      meta: {
        eventId: 'event-d3-1',
        occurredAt: '2026-07-31T09:00:00.000Z',
        source: 'telegram',
        userId: '7001',
      },
      payload: { incoming: { chatId: 7001, messageId: 99, text: 'Нужна помощь' } },
    },
    nowIso: '2026-07-31T09:00:00.000Z',
    values: {},
    base: { actor: { isAdmin: false }, identityLinks: [], facts: { adminChatId: 9001 } },
  };
}

function ports(canonicalWrite: boolean) {
  const mutations: DbWriteMutation[] = [];
  const readPort: DbReadPort = {
    readDb: async <T>(query: Parameters<DbReadPort['readDb']>[0]): Promise<T> => {
      if (query.type === 'conversation.openByIdentity') {
        return { id: 'legacy-conversation', first_name: 'Иван' } as T;
      }
      if (query.type === 'platformUser.idByChannelBinding') {
        return '22222222-2222-4222-8222-222222222222' as T;
      }
      throw new Error(`unexpected read: ${query.type}`);
    },
  };
  const writePort: DbWritePort = {
    writeDb: async (mutation) => {
      mutations.push(mutation);
    },
  };
  const webappEventsPort: WebappEventsPort = {
    emit: vi.fn().mockResolvedValue({ ok: true, status: 200 }),
    syncSupportUserMessage: vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      ...(canonicalWrite
        ? {
            canonicalWrite: {
              conversationId: canonicalConversationId,
              organizationId: '11111111-1111-4111-8111-111111111111',
            },
          }
        : {}),
    }),
  };
  return { mutations, readPort, writePort, webappEventsPort };
}

const action: Action = {
  id: 'relay-d3',
  type: 'conversation.user.message',
  mode: 'sync',
  params: { source: 'telegram' },
};

describe('D3 webapp support ownership handoff', () => {
  it('executes the canonical result returned by webapp', async () => {
    const deps = ports(true);

    const result = await handleConversationUserMessage(action, context(), deps);

    expect(result.status).toBe('success');
    expect(result.values?.activeConversationId).toBe(canonicalConversationId);
    expect(deps.mutations.map((mutation) => mutation.type)).toEqual([
      'conversation.mergeLegacyToPlatform',
      'conversation.message.add',
      'conversation.state.set',
    ]);
    expect(deps.mutations[1]?.params).toMatchObject({
      conversationId: canonicalConversationId,
      canonicalWriteHandled: true,
      externalChatId: '7001',
      externalMessageId: '99',
    });
    expect(deps.mutations[2]?.params).toMatchObject({
      id: canonicalConversationId,
      canonicalWriteHandled: true,
    });
    expect(result.intents).toEqual([]);
  });

  it('keeps the legacy conversation and write behavior when the optional result is absent', async () => {
    const deps = ports(false);

    const result = await handleConversationUserMessage(action, context(), deps);

    expect(result.status).toBe('success');
    expect(result.values?.activeConversationId).toBe('legacy-conversation');
    expect(deps.mutations.map((mutation) => mutation.type)).toEqual([
      'conversation.message.add',
      'conversation.state.set',
      'conversation.mergeLegacyToPlatform',
    ]);
    expect(deps.mutations[0]?.params).toMatchObject({
      conversationId: 'legacy-conversation',
      canonicalWriteHandled: false,
    });
    expect(deps.mutations[1]?.params).toMatchObject({
      id: 'legacy-conversation',
      canonicalWriteHandled: false,
    });
    expect(result.intents).toEqual([]);
  });
});
