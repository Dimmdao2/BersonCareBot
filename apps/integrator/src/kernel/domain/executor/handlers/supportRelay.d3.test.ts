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
          delivery: {
            channels: ['telegram'],
            maxAttempts: 1,
            senderScope: 'clinic_required',
          },
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

  it('admin->user: replying to a legacy (non-webapp) conversation gets an honest skip, not silence', async () => {
    // D23: the bot-side admin console that used to service `conv-tg-1`-shaped legacy
    // conversations was cut. The admin must be told the reply did not go through instead of
    // hearing nothing, regardless of what type of message they sent.
    const mutations: DbWriteMutation[] = [];
    const readPort: DbReadPort = {
      readDb: async (): Promise<never> => {
        throw new Error('legacy admin-reply must not touch the DB anymore');
      },
    };
    const writePort: DbWritePort = {
      writeDb: async (mutation) => {
        mutations.push(mutation);
      },
    };
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

    const result = await handleConversationAdminReply(adminReplyAction, ctx, { readPort, writePort });

    expect(result.status).toBe('skipped');
    expect(result.error).toBe('CONVERSATION_ADMIN_REPLY_LEGACY_REMOVED');
    expect(result.intents).toEqual([
      expect.objectContaining({
        payload: expect.objectContaining({ recipient: { chatId: 9001 } }),
      }),
    ]);
    expect(mutations).toEqual([]);
  });
});
