import { describe, expect, it, vi } from 'vitest';
import type {
  Action,
  DbReadPort,
  DbWriteMutation,
  DbWritePort,
  DomainContext,
  TemplatePort,
  WebappEventsPort,
} from '../../../contracts/index.js';
import type { SupportRelayPolicy } from '../helpers.js';
import { handleConversationAdminReply, handleConversationUserMessage } from './supportRelay.js';

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

/** Renders `<templateId>` as its own text so assertions don't pin content copy, only which key was used. */
function stubTemplatePort(): TemplatePort {
  return {
    renderTemplate: vi.fn(async ({ templateId }) => ({ text: `text:${templateId}` })),
  };
}

function policy(overrides: Partial<SupportRelayPolicy>): SupportRelayPolicy {
  return {
    isAllowedUserToAdmin: () => true,
    isAllowedAdminToUser: () => true,
    ...overrides,
  };
}

describe('D32 unsupported message type gets a reply, not silence', () => {
  it('user->admin: unsupported type replies to the sender and is not forwarded', async () => {
    const mutations: DbWriteMutation[] = [];
    const readPort: DbReadPort = {
      readDb: async <T>(query: Parameters<DbReadPort['readDb']>[0]): Promise<T> => {
        if (query.type === 'conversation.openByIdentity') {
          return { id: 'legacy-conversation' } as T;
        }
        throw new Error(`unexpected read: ${query.type}`);
      },
    };
    const writePort: DbWritePort = {
      writeDb: async (mutation) => {
        mutations.push(mutation);
      },
    };
    const templatePort = stubTemplatePort();
    const ctx = context();
    ctx.event.payload.incoming = {
      chatId: 7001,
      messageId: 99,
      kind: 'message',
      relayMessageType: 'voice',
    };

    const result = await handleConversationUserMessage(action, ctx, {
      readPort,
      writePort,
      templatePort,
      supportRelayPolicy: policy({ isAllowedUserToAdmin: () => false }),
    });

    expect(result.status).toBe('success');
    expect(result.intents).toEqual([
      expect.objectContaining({
        payload: expect.objectContaining({
          recipient: { chatId: 7001 },
          message: { text: 'text:relay.unsupportedType' },
        }),
      }),
    ]);
    expect(mutations).toEqual([]);
  });

  it('user->admin: supported type is forwarded and gets no unsupported-type reply', async () => {
    const deps = ports(false);
    const templatePort = stubTemplatePort();

    const result = await handleConversationUserMessage(action, context(), {
      ...deps,
      templatePort,
      supportRelayPolicy: policy({}),
    });

    expect(result.status).toBe('success');
    expect(deps.mutations.map((mutation) => mutation.type)).toContain('conversation.message.add');
    for (const intent of result.intents ?? []) {
      expect(intent.payload).not.toMatchObject({
        message: { text: 'text:relay.unsupportedType' },
      });
    }
  });

  it('admin->user: unsupported type replies to the admin and is not forwarded', async () => {
    const mutations: DbWriteMutation[] = [];
    const readPort: DbReadPort = {
      readDb: async <T>(query: Parameters<DbReadPort['readDb']>[0]): Promise<T> => {
        if (query.type === 'conversation.byId') {
          return { id: 'conv-tg-1', source: 'telegram', user_chat_id: '5001' } as T;
        }
        throw new Error(`unexpected read: ${query.type}`);
      },
    };
    const writePort: DbWritePort = {
      writeDb: async (mutation) => {
        mutations.push(mutation);
      },
    };
    const templatePort = stubTemplatePort();
    const ctx: DomainContext = {
      event: {
        type: 'message.received',
        meta: {
          eventId: 'event-d32-admin-1',
          occurredAt: '2026-07-31T09:00:00.000Z',
          source: 'telegram',
          userId: '9001',
        },
        payload: {
          incoming: { chatId: 9001, messageId: 555, kind: 'message', relayMessageType: 'voice' },
        },
      },
      nowIso: '2026-07-31T09:00:00.000Z',
      values: {},
      base: { actor: { isAdmin: true }, identityLinks: [], facts: {} },
    };
    const adminReplyAction: Action = {
      id: 'admin-reply-d32',
      type: 'conversation.admin.reply',
      mode: 'sync',
      params: { conversationId: 'conv-tg-1' },
    };

    const result = await handleConversationAdminReply(adminReplyAction, ctx, {
      readPort,
      writePort,
      templatePort,
      supportRelayPolicy: policy({ isAllowedAdminToUser: () => false }),
    });

    expect(result.status).toBe('success');
    expect(result.intents).toEqual([
      expect.objectContaining({
        payload: expect.objectContaining({
          recipient: { chatId: 9001 },
          message: { text: 'text:admin.relay.unsupportedType' },
        }),
      }),
    ]);
    expect(mutations).toEqual([]);
  });

  it('admin->user: supported type is forwarded and gets no unsupported-type reply', async () => {
    const mutations: DbWriteMutation[] = [];
    const readPort: DbReadPort = {
      readDb: async <T>(query: Parameters<DbReadPort['readDb']>[0]): Promise<T> => {
        if (query.type === 'conversation.byId') {
          return { id: 'conv-tg-1', source: 'telegram', user_chat_id: '5001' } as T;
        }
        if (query.type === 'question.byConversationId') {
          return null as T;
        }
        throw new Error(`unexpected read: ${query.type}`);
      },
    };
    const writePort: DbWritePort = {
      writeDb: async (mutation) => {
        mutations.push(mutation);
      },
    };
    const templatePort = stubTemplatePort();
    const ctx: DomainContext = {
      event: {
        type: 'message.received',
        meta: {
          eventId: 'event-d32-admin-2',
          occurredAt: '2026-07-31T09:00:00.000Z',
          source: 'telegram',
          userId: '9001',
        },
        payload: {
          incoming: { chatId: 9001, messageId: 556, kind: 'message', relayMessageType: 'photo' },
        },
      },
      nowIso: '2026-07-31T09:00:00.000Z',
      values: {},
      base: { actor: { isAdmin: true }, identityLinks: [], facts: {} },
    };
    const adminReplyAction: Action = {
      id: 'admin-reply-d32-2',
      type: 'conversation.admin.reply',
      mode: 'sync',
      params: { conversationId: 'conv-tg-1' },
    };

    const result = await handleConversationAdminReply(adminReplyAction, ctx, {
      readPort,
      writePort,
      templatePort,
      supportRelayPolicy: policy({}),
    });

    expect(result.status).toBe('success');
    expect(mutations.map((mutation) => mutation.type)).toContain('conversation.message.add');
    expect(result.intents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'message.copy',
          payload: expect.objectContaining({
            recipient: { chatId: 5001 },
            from_chat_id: 9001,
            message_id: 556,
          }),
        }),
      ]),
    );
    for (const intent of result.intents ?? []) {
      expect(intent.payload).not.toMatchObject({
        message: { text: 'text:admin.relay.unsupportedType' },
      });
    }
  });
});
