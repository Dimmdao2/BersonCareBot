import { describe, expect, it, vi } from 'vitest';
import type { Action, DomainContext } from '../../contracts/index.js';
import { executeAction } from './executeAction.js';

const ctx: DomainContext = {
  event: {
    type: 'webhook.received',
    meta: {
      eventId: 'evt-1',
      occurredAt: '2026-03-05T12:00:00.000Z',
      source: 'source-a',
    },
    payload: {},
  },
  nowIso: '2026-03-05T12:00:00.000Z',
  values: {},
  base: {
    actor: { isAdmin: false },
    identityLinks: [],
  },
};

describe('executeAction', () => {
  it('handles booking.upsert', async () => {
    const writeDb = vi.fn().mockResolvedValue(undefined);
    const action: Action = {
      id: 'a1',
      type: 'booking.upsert',
      mode: 'sync',
      params: { externalRecordId: 'rec-1' },
    };

    const result = await executeAction(action, ctx, {
      writePort: { writeDb },
    });

    expect(result.status).toBe('success');
    expect(writeDb).toHaveBeenCalledTimes(1);
  });

  it('handles message.compose with template', async () => {
    const action: Action = {
      id: 'a2',
      type: 'message.compose',
      mode: 'sync',
      params: {
        source: 'source-a',
        templateId: 'booking.accepted',
        vars: { name: 'test' },
        recipient: { phoneNormalized: '+79990001122' },
        delivery: { channels: ['channel-a'], maxAttempts: 1 },
      },
    };

    const result = await executeAction(action, ctx, {
      templatePort: {
        renderTemplate: vi.fn().mockResolvedValue({ text: 'hello' }),
      },
    });

    expect(result.status).toBe('success');
    expect(result.intents?.[0]?.type).toBe('message.send');
  });

  it('handles intent.enqueueDelivery', async () => {
    const enqueue = vi.fn().mockResolvedValue(undefined);
    const action: Action = {
      id: 'a3',
      type: 'intent.enqueueDelivery',
      mode: 'async',
      params: {
        kind: 'delivery.retry',
        maxAttempts: 2,
        payload: { intentId: 'out-1' },
      },
    };

    const result = await executeAction(action, ctx, {
      queuePort: { enqueue },
    });

    expect(result.status).toBe('queued');
    expect(result.jobs?.[0]?.kind).toBe('delivery.retry');
    expect(enqueue).toHaveBeenCalledTimes(1);
  });

  it('handles user.findByPhone', async () => {
    const readDb = vi.fn().mockResolvedValue({ id: 'u1' });
    const action: Action = {
      id: 'a4',
      type: 'user.findByPhone',
      mode: 'sync',
      params: { phoneNormalized: '+79990001122' },
    };

    const result = await executeAction(action, ctx, {
      readPort: { readDb },
    });

    expect(result.status).toBe('success');
    expect(readDb).toHaveBeenCalledTimes(1);
  });

  it('handles message.retry.enqueue action', async () => {
    const writeDb = vi.fn().mockResolvedValue(undefined);
    const action: Action = {
      id: 'a5',
      type: 'message.retry.enqueue',
      mode: 'async',
      params: {
        phoneNormalized: '+79990001122',
        messageText: 'hello',
        firstTryDelaySeconds: 60,
        maxAttempts: 2,
      },
    };

    const result = await executeAction(action, ctx, {
      writePort: { writeDb },
    });

    expect(result.status).toBe('queued');
    expect(writeDb).toHaveBeenCalledTimes(1);
  });

  it('handles message.deliver by creating ready delivery job', async () => {
    const enqueue = vi.fn().mockResolvedValue(undefined);
    const action: Action = {
      id: 'a6',
      type: 'message.deliver',
      mode: 'async',
      params: {
        payload: {
          message: { text: 'ready-message' },
          delivery: { channels: ['channel-a', 'channel-b'] },
        },
        targets: [
          { resource: 'channel-a', address: { chatId: 123 } },
          { resource: 'channel-b', address: { phoneNormalized: '+79990001122' } },
        ],
        retry: {
          maxAttempts: 3,
          backoffSeconds: [0, 60, 120],
        },
        onFail: {
          adminNotifyIntent: {
            type: 'message.send',
            meta: {
              eventId: 'debug-1',
              occurredAt: '2026-03-05T12:00:00.000Z',
              source: 'domain',
            },
            payload: { message: { text: 'debug' } },
          },
        },
      },
    };

    const result = await executeAction(action, ctx, {
      queuePort: { enqueue },
    });

    expect(result.status).toBe('queued');
    expect(result.jobs?.[0]?.kind).toBe('message.deliver');
    expect(result.jobs?.[0]?.payload?.intent).toBeTruthy();
    expect(result.jobs?.[0]?.targets?.length).toBeGreaterThan(0);
    expect(result.jobs?.[0]?.retry?.maxAttempts).toBe(3);
    expect(enqueue).toHaveBeenCalledTimes(1);
  });

  it('applies rubitime delivery policy when message.send fields are missing', async () => {
    const deliveryDefaultsPort = {
      getDeliveryDefaults: async (source: string, options?: { inputAction?: string }) =>
        source === 'rubitime' && options?.inputAction === 'created'
          ? {
              preferredLinkedChannels: ['telegram'],
              defaultChannels: ['telegram'],
              fallbackChannels: ['smsc'],
              retry: { maxAttempts: 3, backoffSeconds: [60, 60, 60] },
            }
          : null,
    };
    const result = await executeAction({
      id: 'a6b',
      type: 'message.send',
      mode: 'async',
      params: {
        recipient: { phoneNormalized: '+79990001122' },
        recipientPolicy: { lookupByPhone: true },
        message: {},
        templateKey: 'rubitime:bookingAccepted',
      },
    }, {
      ...ctx,
      event: {
        ...ctx.event,
        meta: {
          ...ctx.event.meta,
          source: 'rubitime',
        },
      },
      values: {
        ...ctx.values,
        input: { action: 'created' },
      },
    }, { deliveryDefaultsPort });

    expect(result.status).toBe('success');
    expect(result.intents?.[0]?.payload).toMatchObject({
      recipientPolicy: {
        lookupByPhone: true,
        preferredLinkedChannels: ['telegram'],
      },
      delivery: {
        channels: ['telegram'],
        maxAttempts: 3,
      },
      retry: {
        maxAttempts: 3,
        backoffSeconds: [60, 60, 60],
      },
      onFail: {
        fallbackIntent: {
          type: 'message.send',
          payload: {
            delivery: {
              channels: ['smsc'],
              maxAttempts: 1,
            },
            templateKey: 'rubitime:bookingAccepted',
          },
        },
      },
    });
  });

  it('keeps explicit message.send delivery fields without override', async () => {
    const result = await executeAction({
      id: 'a6c',
      type: 'message.send',
      mode: 'async',
      params: {
        recipient: { phoneNormalized: '+79990001122' },
        recipientPolicy: {
          lookupByPhone: true,
          preferredLinkedChannels: ['vk'],
        },
        message: { text: 'custom' },
        delivery: {
          channels: ['smsc'],
          maxAttempts: 9,
        },
        retry: {
          maxAttempts: 9,
          backoffSeconds: [10],
        },
        onFail: {
          fallbackIntent: {
            type: 'message.send',
            payload: {
              delivery: { channels: ['vk'], maxAttempts: 2 },
            },
          },
        },
      },
    }, {
      ...ctx,
      event: {
        ...ctx.event,
        meta: {
          ...ctx.event.meta,
          source: 'rubitime',
        },
      },
    });

    expect(result.status).toBe('success');
    expect(result.intents?.[0]?.payload).toMatchObject({
      recipientPolicy: {
        lookupByPhone: true,
        preferredLinkedChannels: ['vk'],
      },
      delivery: {
        channels: ['smsc'],
        maxAttempts: 9,
      },
      retry: {
        maxAttempts: 9,
        backoffSeconds: [10],
      },
      onFail: {
        fallbackIntent: {
          payload: {
            delivery: { channels: ['vk'], maxAttempts: 2 },
          },
        },
      },
    });
  });

  it('renders generic message.send template text through TemplatePort', async () => {
    const templatePort = {
      renderTemplate: vi.fn().mockImplementation(async ({ templateId, vars }) => ({
        text: templateId === 'booking.accepted'
          ? `Запись подтверждена: ${String((vars as Record<string, unknown>).slot ?? '')}`
          : '',
      })),
    };

    const result = await executeAction({
      id: 'a6d',
      type: 'message.send',
      mode: 'async',
      params: {
        recipient: { chatId: 123 },
        templateKey: 'telegram:booking.accepted',
        vars: { slot: '10:00' },
        delivery: { channels: ['telegram'], maxAttempts: 1 },
      },
    }, ctx, { templatePort });

    expect(result.status).toBe('success');
    expect(result.intents?.[0]?.payload).toMatchObject({
      recipient: { chatId: 123 },
      message: { text: 'Запись подтверждена: 10:00' },
      delivery: { channels: ['telegram'], maxAttempts: 1 },
    });
  });

  it('keeps async message.send immediate for scenario-selected channels', async () => {
    const enqueue = vi.fn().mockResolvedValue(undefined);
    const result = await executeAction({
      id: 'a6e',
      type: 'message.send',
      mode: 'async',
      params: {
        recipient: { chatId: 123 },
        message: { text: 'immediate telegram' },
        delivery: { channels: ['telegram'], maxAttempts: 1 },
      },
    }, {
      ...ctx,
      event: {
        ...ctx.event,
        meta: {
          ...ctx.event.meta,
          source: 'telegram',
        },
      },
    }, { queuePort: { enqueue } });

    expect(result.status).toBe('success');
    expect(result.intents?.[0]?.payload).toMatchObject({
      message: { text: 'immediate telegram' },
      delivery: { channels: ['telegram'], maxAttempts: 1 },
    });
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('handles user.state.set and user.phone.link', async () => {
    const writeDb = vi.fn().mockResolvedValue(undefined);

    const stateResult = await executeAction({
      id: 'a7',
      type: 'user.state.set',
      mode: 'sync',
      params: { channelId: '123', state: 'idle' },
    }, ctx, { writePort: { writeDb } });

    expect(stateResult.status).toBe('success');
    expect(stateResult.values).toEqual({ userState: 'idle' });

    const phoneResult = await executeAction({
      id: 'a8',
      type: 'user.phone.link',
      mode: 'sync',
      params: { channelId: '123', phoneNormalized: '+79990001122' },
    }, ctx, { writePort: { writeDb } });

    expect(phoneResult.status).toBe('success');
    expect(writeDb).toHaveBeenCalledTimes(2);
  });

  it('falls back to incoming actor and contact when linking phone', async () => {
    const writeDb = vi.fn().mockResolvedValue(undefined);
    const messageCtx: DomainContext = {
      ...ctx,
      event: {
        type: 'message.received',
        meta: {
          ...ctx.event.meta,
          source: 'telegram',
          userId: '123',
        },
        payload: {
          incoming: {
            channelId: '123',
            contactPhone: '8 (919) 123-45-67',
          },
        },
      },
    };

    const result = await executeAction({
      id: 'a8b',
      type: 'user.phone.link',
      mode: 'sync',
      params: {},
    }, messageCtx, { writePort: { writeDb } });

    expect(result.status).toBe('success');
    expect(writeDb).toHaveBeenCalledWith({
      type: 'user.phone.link',
      params: {
        resource: 'telegram',
        channelUserId: '123',
        phoneNormalized: '+79191234567',
      },
    });
  });

  it('reminders.rule.toggle resolves userId from channelUserId when userId not in params', async () => {
    const writeDb = vi.fn().mockResolvedValue(undefined);
    const readDb = vi.fn()
      .mockResolvedValueOnce({ userId: 'user-uuid-1' })
      .mockResolvedValueOnce(null);
    const callbackCtx: DomainContext = {
      ...ctx,
      event: {
        type: 'callback.received',
        meta: { ...ctx.event.meta, source: 'telegram' },
        payload: { incoming: { channelUserId: 123, chatId: 123 } },
      },
    };
    const result = await executeAction({
      id: 'rem-toggle',
      type: 'reminders.rule.toggle',
      mode: 'sync',
      params: { channelUserId: '123', category: 'exercise' },
    }, callbackCtx, { readPort: { readDb }, writePort: { writeDb } });
    expect(result.status).toBe('success');
    expect(readDb).toHaveBeenCalledWith({
      type: 'user.byIdentity',
      params: { resource: 'telegram', externalId: '123' },
    });
    expect(writeDb).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'reminders.rule.upsert',
        params: expect.objectContaining({ userId: 'user-uuid-1', category: 'exercise' }),
      }),
    );
  });

  it('upserts and cancels drafts from incoming messages', async () => {
    const writeDb = vi.fn().mockResolvedValue(undefined);
    const messageCtx: DomainContext = {
      ...ctx,
      event: {
        type: 'message.received',
        meta: {
          ...ctx.event.meta,
          source: 'telegram',
          userId: '123',
        },
        payload: {
          incoming: {
            chatId: 123,
            channelId: '123',
            messageId: 55,
            text: 'Хочу задать вопрос',
          },
        },
      },
    };

    const upsertResult = await executeAction({
      id: 'draft-a',
      type: 'draft.upsertFromMessage',
      mode: 'sync',
      params: { source: 'telegram' },
    }, messageCtx, { writePort: { writeDb } });

    expect(upsertResult.status).toBe('success');
    expect(writeDb).toHaveBeenCalledWith({
      type: 'draft.upsert',
      params: expect.objectContaining({
        resource: 'telegram',
        externalId: '123',
        externalChatId: '123',
        externalMessageId: '55',
        draftTextCurrent: 'Хочу задать вопрос',
      }),
    });

    const cancelResult = await executeAction({
      id: 'draft-b',
      type: 'draft.cancel',
      mode: 'sync',
      params: { source: 'telegram' },
    }, messageCtx, { writePort: { writeDb } });

    expect(cancelResult.status).toBe('success');
    expect(writeDb).toHaveBeenLastCalledWith({
      type: 'draft.cancel',
      params: {
        resource: 'telegram',
        externalId: '123',
        source: 'telegram',
      },
    });
  });

  it('sends draft by creating conversation and notifying admin', async () => {
    const writeDb = vi.fn().mockResolvedValue(undefined);
    const readDb = vi.fn().mockResolvedValue({
      id: 'draft-1',
      source: 'telegram',
      channel_id: '123',
      username: 'alice',
      first_name: 'Alice',
      last_name: 'Example',
      external_chat_id: '123',
      external_message_id: '55',
      draft_text_current: 'Последний текст вопроса',
    });
    const templatePort = {
      renderTemplate: vi.fn().mockResolvedValue({
        text: 'Новый вопрос\nОт: Alice Example (@alice)\nTelegram ID: 123\nТекст:\nПоследний текст вопроса',
      }),
    };
    const draftCtx: DomainContext = {
      ...ctx,
      event: {
        type: 'callback.received',
        meta: {
          ...ctx.event.meta,
          source: 'telegram',
          userId: '123',
        },
        payload: {
          incoming: {
            chatId: 123,
            channelUserId: 123,
            action: 'send_question',
            callbackQueryId: 'cb-1',
          },
        },
      },
      base: {
        ...ctx.base,
        facts: { adminChatId: 999 },
      },
    };

    const result = await executeAction({
      id: 'draft-send',
      type: 'draft.send',
      mode: 'sync',
      params: {
        source: 'telegram',
        adminTemplateKey: 'telegram:adminForward',
      },
    }, draftCtx, {
      readPort: { readDb },
      writePort: { writeDb },
      templatePort,
    });

    expect(result.status).toBe('success');
    expect(readDb).toHaveBeenCalledWith({
      type: 'draft.activeByIdentity',
      params: { resource: 'telegram', externalId: '123', source: 'telegram' },
    });
    expect(writeDb).toHaveBeenCalledWith(expect.objectContaining({
      type: 'conversation.open',
      params: expect.objectContaining({
        resource: 'telegram',
        externalId: '123',
        status: 'waiting_admin',
      }),
    }));
    expect(writeDb).toHaveBeenCalledWith(expect.objectContaining({
      type: 'conversation.message.add',
      params: expect.objectContaining({
        senderRole: 'user',
        text: 'Последний текст вопроса',
      }),
    }));
    expect(result.intents?.[0]).toMatchObject({
      type: 'message.send',
      payload: {
        recipient: { chatId: 999 },
        message: { text: expect.stringContaining('Последний текст вопроса') },
      },
    });
  });

  it('routes open conversation user and admin messages through conversation actions', async () => {
    const writeDb = vi.fn().mockResolvedValue(undefined);
    const readDb = vi.fn()
      .mockResolvedValueOnce({
        id: 'conv-1',
        source: 'telegram',
        status: 'waiting_user',
        user_channel_id: '123',
        username: 'alice',
        first_name: 'Alice',
        last_name: 'Example',
      })
      .mockResolvedValueOnce({
        id: 'conv-1',
        source: 'telegram',
        status: 'waiting_admin',
        user_channel_id: '123',
        username: 'alice',
        first_name: 'Alice',
        last_name: 'Example',
      });

    const userCtx: DomainContext = {
      ...ctx,
      event: {
        type: 'message.received',
        meta: {
          ...ctx.event.meta,
          source: 'telegram',
          userId: '123',
        },
        payload: {
          incoming: {
            chatId: 123,
            channelId: '123',
            messageId: 77,
            text: 'Дополнение от пользователя',
          },
        },
      },
      base: {
        ...ctx.base,
        facts: { adminChatId: 999 },
      },
    };

    const userResult = await executeAction({
      id: 'conv-user',
      type: 'conversation.user.message',
      mode: 'sync',
      params: { source: 'telegram' },
    }, userCtx, {
      readPort: { readDb },
      writePort: { writeDb },
    });

    expect(userResult.status).toBe('success');
    expect(userResult.intents?.length).toBeGreaterThanOrEqual(2);
    const notificationIntent = userResult.intents?.find(
      (i) => i.type === 'message.send' && (i.payload as { message?: { text?: string } }).message?.text?.includes('От:'),
    );
    expect(notificationIntent).toBeDefined();
    expect(notificationIntent?.payload).toMatchObject({
      recipient: { chatId: 999 },
      message: { text: expect.stringMatching(/Новое сообщение|От:/) },
    });

    const adminCtx: DomainContext = {
      ...ctx,
      event: {
        type: 'message.received',
        meta: {
          ...ctx.event.meta,
          source: 'telegram',
          userId: '999',
        },
        payload: {
          incoming: {
            chatId: 999,
            channelId: '999',
            messageId: 88,
            text: 'Ответ администратора',
          },
        },
      },
      base: {
        ...ctx.base,
        actor: { isAdmin: true },
        replyMode: true,
        replyConversationId: 'conv-1',
      },
    };

    const adminResult = await executeAction({
      id: 'conv-admin',
      type: 'conversation.admin.reply',
      mode: 'sync',
      params: {},
    }, adminCtx, {
      readPort: { readDb },
      writePort: { writeDb },
    });

    expect(adminResult.status).toBe('success');
    expect(adminResult.intents?.[0]).toMatchObject({
      type: 'message.send',
      payload: {
        recipient: { chatId: 123 },
        message: { text: 'Ответ администратора' },
      },
    });
    expect(adminResult.intents?.[1]).toMatchObject({
      type: 'message.send',
      payload: {
        recipient: { chatId: 999 },
        replyMarkup: expect.objectContaining({
          inline_keyboard: expect.any(Array),
        }),
      },
    });
  });

  it('closes conversation and shows open dialog list', async () => {
    const writeDb = vi.fn().mockResolvedValue(undefined);
    const readDb = vi.fn().mockResolvedValueOnce([{
      id: 'conv-1',
      status: 'waiting_admin',
      user_channel_id: '123',
      username: 'alice',
      first_name: 'Alice',
      last_name: 'Example',
    }]);

    const adminCtx: DomainContext = {
      ...ctx,
      event: {
        type: 'callback.received',
        meta: {
          ...ctx.event.meta,
          source: 'telegram',
          userId: '999',
        },
        payload: {
          incoming: {
            chatId: 999,
            channelUserId: 999,
            conversationId: 'conv-1',
          },
        },
      },
      base: {
        ...ctx.base,
        actor: { isAdmin: true },
      },
    };

    const closeResult = await executeAction({
      id: 'conv-close',
      type: 'conversation.close',
      mode: 'sync',
      params: { conversationId: 'conv-1' },
    }, adminCtx, {
      readPort: { readDb },
      writePort: { writeDb },
    });

    expect(closeResult.status).toBe('success');
    expect(writeDb).toHaveBeenCalledWith(expect.objectContaining({
      type: 'conversation.state.set',
      params: expect.objectContaining({
        id: 'conv-1',
        status: 'closed',
      }),
    }));

    const listResult = await executeAction({
      id: 'conv-list',
      type: 'conversation.listOpen',
      mode: 'sync',
      params: { source: 'telegram', limit: 10 },
    }, adminCtx, {
      readPort: { readDb },
    });

    expect(listResult.status).toBe('success');
    expect(listResult.intents?.[0]).toMatchObject({
      type: 'message.send',
      payload: {
        recipient: { chatId: 999 },
        replyMarkup: expect.objectContaining({
          inline_keyboard: expect.any(Array),
        }),
      },
    });
  });

  it('handles notifications.get and notifications.toggle', async () => {
    const readDb = vi.fn().mockResolvedValue({ notify_spb: true, notify_msk: false, notify_online: false, notify_bookings: false });
    const writeDb = vi.fn().mockResolvedValue(undefined);

    const getResult = await executeAction({
      id: 'a9',
      type: 'notifications.get',
      mode: 'sync',
      params: { channelId: '123' },
    }, ctx, { readPort: { readDb } });

    expect(getResult.values).toEqual({ notifications: { notify_spb: true, notify_msk: false, notify_online: false, notify_bookings: false } });

    const toggleResult = await executeAction({
      id: 'a10',
      type: 'notifications.toggle',
      mode: 'sync',
      params: { channelId: '123', toggleKey: 'notify_toggle_msk', supportsToggleAll: true },
    }, ctx, { readPort: { readDb }, writePort: { writeDb } });

    expect(toggleResult.values).toEqual({ notifications: { notify_spb: true, notify_msk: true, notify_online: false, notify_bookings: false } });
    expect(writeDb).toHaveBeenCalledTimes(1);
  });

  it('builds message.edit, message.replyMarkup.edit and callback.answer intents', async () => {
    const templatePort = {
      renderTemplate: vi.fn().mockImplementation(async ({ templateId }) => ({
        text: templateId === 'notifications.togglePrefix'
          ? '✅/❌'
          : templateId === 'notifications.label.spb'
            ? 'Петербург'
            : 'Текст',
      })),
    };

    const editResult = await executeAction({
      id: 'a11',
      type: 'message.edit',
      mode: 'async',
      params: {
        chatId: 123,
        messageId: 77,
        text: 'updated',
      },
    }, ctx);

    expect(editResult.intents?.[0]).toMatchObject({
      type: 'message.edit',
      payload: {
        recipient: { chatId: 123 },
        messageId: 77,
        message: { text: 'updated' },
      },
    });

    const replyMarkupResult = await executeAction({
      id: 'a12',
      type: 'message.replyMarkup.edit',
      mode: 'async',
      params: {
        chatId: 123,
        messageId: 78,
        inlineKeyboard: [[{
          textTemplateKey: 'telegram:notifications.label.spb',
          prefixTemplateKey: 'telegram:notifications.togglePrefix',
          callbackData: 'notify_toggle_spb',
        }]],
      },
    }, {
      ...ctx,
      values: { notifications: { notify_spb: true, notify_msk: false, notify_online: false, notify_bookings: false } },
    }, { templatePort });

    expect(replyMarkupResult.intents?.[0]).toMatchObject({
      type: 'message.replyMarkup.edit',
      payload: {
        recipient: { chatId: 123 },
        messageId: 78,
        replyMarkup: { inline_keyboard: [[{ text: '✅ Петербург', callback_data: 'notify_toggle_spb' }]] },
      },
    });

    const canonicalReplyMarkupResult = await executeAction({
      id: 'a12b',
      type: 'message.replyMarkup.edit',
      mode: 'async',
      params: {
        chatId: 123,
        messageId: 79,
        inlineKeyboard: [[{
          textTemplateKey: 'telegram:notifications.label.msk',
          prefixTemplateKey: 'telegram:notifications.togglePrefix',
          callbackData: 'notifications.toggle.msk',
        }]],
      },
    }, {
      ...ctx,
      values: { notifications: { notify_spb: false, notify_msk: true, notify_online: false, notify_bookings: false } },
    }, { templatePort });

    expect(canonicalReplyMarkupResult.intents?.[0]).toMatchObject({
      type: 'message.replyMarkup.edit',
      payload: {
        recipient: { chatId: 123 },
        messageId: 79,
        replyMarkup: { inline_keyboard: [[{ text: '✅ Текст', callback_data: 'notifications.toggle.msk' }]] },
      },
    });

    const callbackResult = await executeAction({
      id: 'a13',
      type: 'callback.answer',
      mode: 'async',
      params: { callbackQueryId: 'cb-1' },
    }, ctx);

    expect(callbackResult.intents?.[0]).toMatchObject({ type: 'callback.answer', payload: { callbackQueryId: 'cb-1' } });
  });

  it('passes parse_mode through for message.edit when params.parseMode is HTML', async () => {
    const result = await executeAction({
      id: 'a13b',
      type: 'message.edit',
      mode: 'async',
      params: {
        chatId: 123,
        messageId: 80,
        text: 'Hello <b>world</b>',
        parseMode: 'HTML',
        inlineKeyboard: [[{ text: 'Back', callbackData: 'menu.back' }]],
      },
    }, ctx);

    expect(result.intents?.[0]).toMatchObject({
      type: 'message.edit',
      payload: {
        message: { text: 'Hello <b>world</b>' },
        parse_mode: 'HTML',
        replyMarkup: { inline_keyboard: [[{ text: 'Back', callback_data: 'menu.back' }]] },
      },
    });
  });

  it('lowers telegram presentation actions to message.send', async () => {
    const templatePort = {
      renderTemplate: vi.fn().mockImplementation(async ({ templateId }) => ({
        text: templateId === 'chooseMenu'
          ? 'Выберите действие'
          : templateId === 'menu.book'
            ? '📅 Запись на приём'
            : templateId === 'moreMenu.notifications'
              ? '🔔 Настройки уведомлений'
              : templateId === 'requestPhone.cancelButton'
                ? 'Вернуться в меню'
                : templateId === 'requestContact.button'
                  ? 'Предоставить контакт'
                  : 'Служебное сообщение',
      })),
    };

    const replyKeyboardResult = await executeAction({
      id: 'a14',
      type: 'message.replyKeyboard.show',
      mode: 'async',
      params: {
        chatId: 123,
        templateKey: 'telegram:chooseMenu',
        keyboard: [[{ textTemplateKey: 'telegram:menu.book' }]],
        resizeKeyboard: true,
      },
    }, ctx, { templatePort });

    expect(replyKeyboardResult.intents?.[0]).toMatchObject({
      type: 'message.send',
      payload: {
        recipient: { chatId: 123 },
        message: { text: 'Выберите действие' },
        replyMarkup: { keyboard: [[{ text: '📅 Запись на приём' }]], resize_keyboard: true, one_time_keyboard: false },
      },
    });

    const replyKeyboardWithPhoneResult = await executeAction({
      id: 'a14b',
      type: 'message.replyKeyboard.show',
      mode: 'async',
      params: {
        chatId: 456,
        templateKey: 'telegram:confirmPhoneForBooking',
        keyboard: [[{ textTemplateKey: 'telegram:requestContact.button', requestPhone: true }]],
        resizeKeyboard: true,
        oneTimeKeyboard: true,
      },
    }, { ...ctx, event: { ...ctx.event, meta: { ...ctx.event.meta, source: 'telegram' } } }, { templatePort });

    expect(replyKeyboardWithPhoneResult.intents?.[0]).toMatchObject({
      type: 'message.send',
      payload: {
        recipient: { chatId: 456 },
        replyMarkup: {
          keyboard: [
            [{ text: 'Предоставить контакт', request_contact: true }],
            [{ text: 'Вернуться в меню' }],
          ],
          resize_keyboard: true,
          one_time_keyboard: true,
        },
      },
    });

    const inlineKeyboardResult = await executeAction({
      id: 'a15',
      type: 'message.inlineKeyboard.show',
      mode: 'async',
      params: {
        chatId: 123,
        text: 'inline',
        inlineKeyboard: [[{ textTemplateKey: 'telegram:moreMenu.notifications', callbackData: 'menu_notifications' }]],
      },
    }, ctx, { templatePort });

    expect(inlineKeyboardResult.intents?.[0]).toMatchObject({
      type: 'message.send',
      payload: {
        recipient: { chatId: 123 },
        message: { text: 'inline' },
        replyMarkup: { inline_keyboard: [[{ text: '🔔 Настройки уведомлений', callback_data: 'menu_notifications' }]] },
      },
    });

    const adminForwardResult = await executeAction({
      id: 'a16',
      type: 'admin.forward',
      mode: 'async',
      params: {
        chatId: 999,
        templateKey: 'telegram:adminForward',
        vars: {
          name: 'Иван',
        },
      },
    }, ctx, {
      templatePort: {
        renderTemplate: vi.fn().mockImplementation(async ({ templateId, vars }) => ({
          text: templateId === 'adminForward'
            ? `forwarded ${(vars as Record<string, unknown>).name ?? ''}`
            : '',
        })),
      },
    });

    expect(adminForwardResult.intents?.[0]).toMatchObject({
      type: 'message.send',
      payload: {
        recipient: { chatId: 999 },
        message: { text: 'forwarded Иван' },
      },
    });
  });

  it('attaches main reply keyboard to user messages without explicit keyboard when enabled', async () => {
    const templatePort = {
      renderTemplate: vi.fn().mockImplementation(async ({ templateId }) => ({
        text: templateId === 'questionAccepted'
          ? 'Вопрос принят. Я отвечу вам в ближайшее время.'
          : templateId === 'menu.book'
            ? '📅 Запись на приём'
            : templateId === 'menu.more'
              ? '⚙️ Меню'
              : '',
      })),
    };

    const result = await executeAction({
      id: 'a17',
      type: 'message.send',
      mode: 'async',
      params: {
        recipient: { chatId: 123 },
        templateKey: 'telegram:questionAccepted',
        delivery: { channels: ['telegram'], maxAttempts: 1 },
      },
    }, { ...ctx, event: { ...ctx.event, meta: { ...ctx.event.meta, source: 'telegram' }, payload: { incoming: { text: 'question', chatId: 123 } } } }, {
      templatePort,
      sendMenuOnButtonPress: true,
      contentPort: {
        getTemplate: vi.fn(),
        getBundle: vi.fn().mockResolvedValue({
          scripts: [],
          templates: {},
          mainReplyKeyboard: [[
            { textTemplateKey: 'telegram:menu.book' },
            { textTemplateKey: 'telegram:menu.more' },
          ]],
        }),
      },
    });

    expect(result.intents?.[0]).toMatchObject({
      type: 'message.send',
      payload: {
        recipient: { chatId: 123 },
        message: { text: 'Вопрос принят. Я отвечу вам в ближайшее время.' },
        replyMarkup: {
          keyboard: [[
            { text: '📅 Запись на приём' },
            { text: '⚙️ Меню' },
          ]],
          resize_keyboard: true,
          one_time_keyboard: false,
        },
      },
    });
  });

  it('attaches main reply keyboard when user pressed Меню or Запись на приём', async () => {
    const templatePort = {
      renderTemplate: vi.fn().mockImplementation(async ({ templateId }) => ({
        text: templateId === 'menu.more'
          ? '⚙️ Меню'
          : templateId === 'menu.book'
            ? '📅 Запись на приём'
            : '',
      })),
    };

    const result = await executeAction({
      id: 'a17b',
      type: 'message.send',
      mode: 'async',
      params: {
        recipient: { chatId: 123 },
        templateKey: 'telegram:menu.more',
        delivery: { channels: ['telegram'], maxAttempts: 1 },
      },
    }, { ...ctx, event: { ...ctx.event, meta: { ...ctx.event.meta, source: 'telegram' }, payload: { incoming: { action: 'menu.more', text: '⚙️ Меню', chatId: 123 } } } }, {
      templatePort,
      sendMenuOnButtonPress: true,
      contentPort: {
        getTemplate: vi.fn(),
        getBundle: vi.fn().mockResolvedValue({
          scripts: [],
          templates: {},
          mainReplyKeyboard: [[
            { textTemplateKey: 'telegram:menu.book' },
            { textTemplateKey: 'telegram:menu.more' },
          ]],
        }),
      },
    });

    expect(result.intents?.[0]).toMatchObject({
      type: 'message.send',
      payload: {
        recipient: { chatId: 123 },
        message: { text: '⚙️ Меню' },
        replyMarkup: {
          keyboard: [[
            { text: '📅 Запись на приём' },
            { text: '⚙️ Меню' },
          ]],
          resize_keyboard: true,
          one_time_keyboard: false,
        },
      },
    });
  });

  it('sends single intent for inline keyboard (no follow-up reply menu)', async () => {
    const templatePort = {
      renderTemplate: vi.fn().mockImplementation(async ({ templateId }) => ({
        text: templateId === 'moreMenu.notifications'
          ? '🔔 Настройки уведомлений'
          : templateId === 'menu.book'
            ? '📅 Запись на приём'
            : templateId === 'menu.more'
              ? '⚙️ Меню'
              : '',
      })),
    };

    const result = await executeAction({
      id: 'a18',
      type: 'message.inlineKeyboard.show',
      mode: 'async',
      params: {
        chatId: 123,
        text: 'inline',
        inlineKeyboard: [[{ textTemplateKey: 'telegram:moreMenu.notifications', callbackData: 'menu_notifications' }]],
      },
    }, { ...ctx, event: { ...ctx.event, meta: { ...ctx.event.meta, source: 'telegram' } } }, {
      templatePort,
      sendMenuOnButtonPress: true,
      contentPort: {
        getTemplate: vi.fn(),
        getBundle: vi.fn().mockResolvedValue({
          scripts: [],
          templates: {},
          mainReplyKeyboard: [[
            { textTemplateKey: 'telegram:menu.book' },
            { textTemplateKey: 'telegram:menu.more' },
          ]],
        }),
      },
    });

    expect(result.intents).toHaveLength(1);
    expect(result.intents?.[0]).toMatchObject({
      type: 'message.send',
      payload: {
        recipient: { chatId: 123 },
        message: { text: 'inline' },
        replyMarkup: { inline_keyboard: [[{ text: '🔔 Настройки уведомлений', callback_data: 'menu_notifications' }]] },
      },
    });
  });

  it('sends single intent for message.edit (no follow-up reply menu)', async () => {
    const templatePort = {
      renderTemplate: vi.fn().mockImplementation(async ({ templateId }) => ({
        text: templateId === 'menu.book'
          ? '📅 Запись на приём'
          : templateId === 'menu.more'
            ? '⚙️ Меню'
            : '',
      })),
    };

    const result = await executeAction({
      id: 'a19',
      type: 'message.edit',
      mode: 'async',
      params: {
        chatId: 123,
        messageId: 77,
        text: 'updated',
      },
    }, { ...ctx, event: { ...ctx.event, meta: { ...ctx.event.meta, source: 'telegram' } } }, {
      templatePort,
      sendMenuOnButtonPress: true,
      contentPort: {
        getTemplate: vi.fn(),
        getBundle: vi.fn().mockResolvedValue({
          scripts: [],
          templates: {},
          mainReplyKeyboard: [[
            { textTemplateKey: 'telegram:menu.book' },
            { textTemplateKey: 'telegram:menu.more' },
          ]],
        }),
      },
    });

    expect(result.intents).toHaveLength(1);
    expect(result.intents?.[0]).toMatchObject({
      type: 'message.edit',
      payload: {
        recipient: { chatId: 123 },
        messageId: 77,
        message: { text: 'updated' },
      },
    });
  });

  describe('support relay', () => {
    const createSupportRelayPolicy = (userToAdmin: string[], adminToUser: string[]) => ({
      isAllowedUserToAdmin: (t: string) => userToAdmin.includes(t),
      isAllowedAdminToUser: (t: string) => adminToUser.includes(t),
    });

    it('conversation.user.message: returns refusal intent when type not allowed user->admin', async () => {
      const readDb = vi.fn().mockResolvedValue({
        id: 'conv-1',
        source: 'telegram',
        user_channel_id: '123',
        first_name: 'A',
        last_name: 'B',
        username: 'u',
      });
      const userCtx: DomainContext = {
        ...ctx,
        event: {
          type: 'message.received',
          meta: { ...ctx.event.meta, source: 'telegram', userId: '123' },
          payload: {
            incoming: {
              kind: 'message',
              chatId: 123,
              channelId: '123',
              messageId: 42,
              text: '',
              relayMessageType: 'voice',
            },
          },
        },
        base: { ...ctx.base, facts: { adminChatId: 999 } },
      };
      const result = await executeAction({
        id: 'u1',
        type: 'conversation.user.message',
        mode: 'sync',
        params: { source: 'telegram' },
      }, userCtx, {
        readPort: { readDb },
        writePort: { writeDb: vi.fn().mockResolvedValue(undefined) },
        supportRelayPolicy: createSupportRelayPolicy(['text', 'photo'], ['text', 'photo', 'document']),
      });
      expect(result.status).toBe('success');
      expect(result.intents).toHaveLength(1);
      expect(result.intents?.[0]).toMatchObject({
        type: 'message.send',
        payload: {
          recipient: { chatId: 123 },
          message: { text: expect.any(String) },
        },
      });
      expect(result.writes).toBeUndefined();
    });

    it('conversation.user.message: includes message.copy when type allowed and chatId/messageId present', async () => {
      const writeDb = vi.fn().mockResolvedValue(undefined);
      const readDb = vi.fn().mockResolvedValue({
        id: 'conv-1',
        source: 'telegram',
        user_channel_id: '123',
        first_name: 'A',
        last_name: 'B',
        username: 'u',
      });
      const userCtx: DomainContext = {
        ...ctx,
        event: {
          type: 'message.received',
          meta: { ...ctx.event.meta, source: 'telegram', userId: '123' },
          payload: {
            incoming: {
              kind: 'message',
              chatId: 123,
              channelId: '123',
              messageId: 99,
              text: 'Hello',
              relayMessageType: 'text',
            },
          },
        },
        base: { ...ctx.base, facts: { adminChatId: 999 } },
      };
      const result = await executeAction({
        id: 'u2',
        type: 'conversation.user.message',
        mode: 'sync',
        params: { source: 'telegram' },
      }, userCtx, {
        readPort: { readDb },
        writePort: { writeDb },
        supportRelayPolicy: createSupportRelayPolicy(['text', 'photo'], ['text']),
      });
      expect(result.status).toBe('success');
      expect(result.intents?.length).toBeGreaterThanOrEqual(2);
      const copyIntent = result.intents?.find((i) => i.type === 'message.copy');
      expect(copyIntent).toBeDefined();
      expect(copyIntent?.payload).toMatchObject({
        recipient: { chatId: 999 },
        from_chat_id: 123,
        message_id: 99,
      });
      const notificationIntent = result.intents?.find(
        (i) => i.type === 'message.send' && (i.payload as { message?: { text?: string } }).message?.text?.includes('Новое сообщение'),
      );
      expect(notificationIntent).toBeDefined();
      expect(notificationIntent?.payload).toMatchObject({
        recipient: { chatId: 999 },
        message: { text: expect.stringContaining('Новое сообщение') },
      });
    });

    it('conversation.user.message: routes MAX text to MAX admin chat without telegram copy', async () => {
      const writeDb = vi.fn().mockResolvedValue(undefined);
      const readDb = vi.fn().mockResolvedValue({
        id: 'conv-max-1',
        source: 'max',
        user_channel_id: '456',
        first_name: 'M',
        last_name: 'A',
        username: 'max-user',
      });
      const userCtx: DomainContext = {
        ...ctx,
        event: {
          type: 'message.received',
          meta: { ...ctx.event.meta, source: 'max', userId: '456' },
          payload: {
            incoming: {
              kind: 'message',
              chatId: 456,
              channelId: '456',
              messageId: 'mid-456',
              text: 'Hello from MAX',
              relayMessageType: 'text',
            },
          },
        },
        base: { ...ctx.base, facts: { adminChatId: 156854402 } },
      };
      const result = await executeAction({
        id: 'u-max-1',
        type: 'conversation.user.message',
        mode: 'sync',
        params: { source: 'max' },
      }, userCtx, {
        readPort: { readDb },
        writePort: { writeDb },
        supportRelayPolicy: createSupportRelayPolicy(['text', 'photo'], ['text']),
      });
      expect(result.status).toBe('success');
      expect(result.intents?.some((i) => i.type === 'message.copy')).toBe(false);
      const adminIntents = result.intents?.filter(
        (i) => i.type === 'message.send'
          && (i.payload as { recipient?: { chatId?: number }; delivery?: { channels?: string[] } }).recipient?.chatId === 156854402,
      );
      expect(adminIntents?.length).toBe(2);
      expect(adminIntents?.every((i) => (i.payload as { delivery?: { channels?: string[] } }).delivery?.channels?.[0] === 'max')).toBe(true);
    });

    it('conversation.admin.reply: returns refusal intent when type not allowed admin->user', async () => {
      const readDb = vi.fn().mockImplementation((query: { type: string }) => {
        if (query.type === 'conversation.byId') {
          return Promise.resolve({
            id: 'conv-1',
            source: 'telegram',
            user_channel_id: '456',
          });
        }
        return Promise.resolve(null);
      });
      const adminCtx: DomainContext = {
        ...ctx,
        event: {
          type: 'message.received',
          meta: { ...ctx.event.meta, source: 'telegram' },
          payload: {
            incoming: {
              kind: 'message',
              chatId: 999,
              channelId: '999',
              messageId: 11,
              text: '',
              relayMessageType: 'voice',
            },
          },
        },
        base: { ...ctx.base },
      };
      const result = await executeAction({
        id: 'r1',
        type: 'conversation.admin.reply',
        mode: 'sync',
        params: { conversationId: 'conv-1' },
      }, adminCtx, {
        readPort: { readDb },
        writePort: { writeDb: vi.fn().mockResolvedValue(undefined) },
        supportRelayPolicy: createSupportRelayPolicy(['text', 'photo'], ['text', 'photo']),
      });
      expect(result.status).toBe('success');
      expect(result.intents).toHaveLength(1);
      expect(result.intents?.[0]).toMatchObject({
        type: 'message.send',
        payload: {
          recipient: { chatId: 999 },
          message: { text: expect.any(String) },
        },
      });
      expect(result.writes).toBeUndefined();
    });

    it('conversation.admin.reply: uses message.copy when allowed non-text type', async () => {
      const writeDb = vi.fn().mockResolvedValue(undefined);
      const readDb = vi.fn().mockImplementation((query: { type: string; params?: { conversationId?: string } }) => {
        if (query.type === 'conversation.byId') {
          return Promise.resolve({
            id: 'conv-2',
            source: 'telegram',
            user_channel_id: '456',
          });
        }
        if (query.type === 'question.byConversationId') {
          return Promise.resolve(null);
        }
        return Promise.resolve(null);
      });
      const adminCtx: DomainContext = {
        ...ctx,
        event: {
          type: 'message.received',
          meta: { ...ctx.event.meta, source: 'telegram' },
          payload: {
            incoming: {
              kind: 'message',
              chatId: 999,
              channelId: '999',
              messageId: 22,
              text: '',
              relayMessageType: 'photo',
            },
          },
        },
        base: { ...ctx.base },
      };
      const result = await executeAction({
        id: 'r2',
        type: 'conversation.admin.reply',
        mode: 'sync',
        params: { conversationId: 'conv-2' },
      }, adminCtx, {
        readPort: { readDb },
        writePort: { writeDb },
        supportRelayPolicy: createSupportRelayPolicy(['text', 'photo'], ['text', 'photo', 'document']),
      });
      expect(result.status).toBe('success');
      expect(result.writes).toBeDefined();
      expect(result.writes?.some((w) => w.type === 'conversation.message.add' && w.params?.text === '[photo]')).toBe(true);
      const copyIntent = result.intents?.find((i) => i.type === 'message.copy');
      expect(copyIntent).toBeDefined();
      expect(copyIntent?.payload).toMatchObject({
        recipient: { chatId: 456 },
        from_chat_id: 999,
        message_id: 22,
      });
      const confirmIntent = result.intents?.find((i) => i.type === 'message.send' && (i.payload as { recipient?: { chatId?: number } })?.recipient?.chatId === 999);
      expect(confirmIntent).toBeDefined();
    });

    it('conversation.admin.reply: sends text to user and confirmation to admin', async () => {
      const writeDb = vi.fn().mockResolvedValue(undefined);
      const readDb = vi.fn().mockImplementation((query: { type: string }) => {
        if (query.type === 'conversation.byId') {
          return Promise.resolve({
            id: 'conv-3',
            source: 'telegram',
            user_channel_id: '789',
          });
        }
        if (query.type === 'question.byConversationId') {
          return Promise.resolve(null);
        }
        return Promise.resolve(null);
      });
      const adminCtx: DomainContext = {
        ...ctx,
        event: {
          type: 'message.received',
          meta: { ...ctx.event.meta, source: 'telegram' },
          payload: {
            incoming: {
              kind: 'message',
              chatId: 999,
              channelId: '999',
              messageId: 33,
              text: 'Reply text',
              relayMessageType: 'text',
            },
          },
        },
        base: { ...ctx.base },
      };
      const result = await executeAction({
        id: 'r3',
        type: 'conversation.admin.reply',
        mode: 'sync',
        params: { conversationId: 'conv-3' },
      }, adminCtx, {
        readPort: { readDb },
        writePort: { writeDb },
        supportRelayPolicy: createSupportRelayPolicy(['text'], ['text', 'photo']),
      });
      expect(result.status).toBe('success');
      expect(result.writes).toBeDefined();
      const userSendIntent = result.intents?.find(
        (i) => i.type === 'message.send' && (i.payload as { recipient?: { chatId?: number } })?.recipient?.chatId === 789,
      );
      expect(userSendIntent).toBeDefined();
      expect(userSendIntent?.payload).toMatchObject({
        message: { text: 'Reply text' },
      });
      const adminConfirmIntent = result.intents?.find(
        (i) => i.type === 'message.send' && (i.payload as { recipient?: { chatId?: number } })?.recipient?.chatId === 999,
      );
      expect(adminConfirmIntent).toBeDefined();
    });

    it('conversation.admin.reply: sends MAX text to MAX user and confirms in MAX admin chat', async () => {
      const writeDb = vi.fn().mockResolvedValue(undefined);
      const readDb = vi.fn().mockImplementation((query: { type: string }) => {
        if (query.type === 'conversation.byId') {
          return Promise.resolve({
            id: 'conv-max-2',
            source: 'max',
            user_channel_id: '456',
          });
        }
        if (query.type === 'question.byConversationId') {
          return Promise.resolve(null);
        }
        return Promise.resolve(null);
      });
      const adminCtx: DomainContext = {
        ...ctx,
        event: {
          type: 'message.received',
          meta: { ...ctx.event.meta, source: 'max' },
          payload: {
            incoming: {
              kind: 'message',
              chatId: 156854402,
              channelId: '89002800',
              messageId: 'mid-admin-1',
              text: 'MAX admin reply',
              relayMessageType: 'text',
            },
          },
        },
        base: { ...ctx.base },
      };
      const result = await executeAction({
        id: 'r-max-1',
        type: 'conversation.admin.reply',
        mode: 'sync',
        params: { conversationId: 'conv-max-2' },
      }, adminCtx, {
        readPort: { readDb },
        writePort: { writeDb },
        supportRelayPolicy: createSupportRelayPolicy(['text'], ['text', 'photo']),
      });
      expect(result.status).toBe('success');
      expect(result.intents?.some((i) => i.type === 'message.copy')).toBe(false);
      const userSendIntent = result.intents?.find(
        (i) => i.type === 'message.send' && (i.payload as { recipient?: { chatId?: number } })?.recipient?.chatId === 456,
      );
      expect(userSendIntent).toBeDefined();
      expect((userSendIntent?.payload as { delivery?: { channels?: string[] } }).delivery?.channels).toEqual(['max']);
      const adminConfirmIntent = result.intents?.find(
        (i) => i.type === 'message.send' && (i.payload as { recipient?: { chatId?: number } })?.recipient?.chatId === 156854402,
      );
      expect(adminConfirmIntent).toBeDefined();
      expect((adminConfirmIntent?.payload as { delivery?: { channels?: string[] } }).delivery?.channels).toEqual(['max']);
    });
  });

  describe('diary.symptom.afterTrackingCreated', () => {
    const telegramCtx: DomainContext = {
      ...ctx,
      event: {
        type: 'message.received',
        meta: { eventId: 'evt-diary', occurredAt: '2026-03-16T12:00:00.000Z', source: 'telegram' },
        payload: {
          incoming: {
            text: 'Головная боль',
            chatId: 111,
            channelUserId: 222,
          },
        },
      },
    };

    it('sends intensity prompt with 0-10 inline buttons when tracking is found by title', async () => {
      const listSymptomTrackings = vi.fn().mockResolvedValue({
        ok: true,
        trackings: [
          {
            id: 'track-uuid-1',
            userId: 'user-1',
            symptomKey: null,
            symptomTitle: 'Головная боль',
            isActive: true,
            createdAt: '2026-03-16T10:00:00.000Z',
            updatedAt: '2026-03-16T10:00:00.000Z',
          },
        ],
      });
      const readDb = vi.fn().mockResolvedValue({ userId: 'user-1', userState: 'idle' });
      const action: Action = {
        id: 'after',
        type: 'diary.symptom.afterTrackingCreated',
        mode: 'async',
        params: { symptomTitle: 'Головная боль', chatId: 111 },
      };
      const result = await executeAction(action, telegramCtx, {
        readPort: { readDb },
        webappEventsPort: { listSymptomTrackings, emit: vi.fn(), listLfkComplexes: vi.fn() },
      });
      expect(result.status).toBe('success');
      expect(result.intents).toHaveLength(1);
      expect(result.intents?.[0]?.type).toBe('message.send');
      const payload = result.intents?.[0]?.payload as { message?: { text?: string }; replyMarkup?: { inline_keyboard?: unknown[] } };
      expect(payload.message?.text).toMatch(/интенсивность/);
      expect(payload.replyMarkup?.inline_keyboard).toHaveLength(1);
      expect((payload.replyMarkup?.inline_keyboard?.[0] as unknown[]).length).toBe(11);
      const firstButton = (payload.replyMarkup?.inline_keyboard?.[0] as { callback_data?: string }[])?.[0];
      expect(firstButton?.callback_data).toMatch(/^diary\.symptom\.value:track-uuid-1:0$/);
    });

    it('sends fallback tracking-created message when no tracking found by title', async () => {
      const listSymptomTrackings = vi.fn().mockResolvedValue({ ok: true, trackings: [] });
      const readDb = vi.fn().mockResolvedValue({ userId: 'user-1' });
      const action: Action = {
        id: 'after',
        type: 'diary.symptom.afterTrackingCreated',
        mode: 'async',
        params: { symptomTitle: 'Редкий симптом', chatId: 111 },
      };
      const result = await executeAction(action, telegramCtx, {
        readPort: { readDb },
        webappEventsPort: { listSymptomTrackings, emit: vi.fn(), listLfkComplexes: vi.fn() },
      });
      expect(result.status).toBe('success');
      expect(result.intents?.[0]?.payload).toMatchObject({
        message: { text: expect.stringContaining('Запись') },
        replyMarkup: { inline_keyboard: [[{ text: expect.stringContaining('К списку'), callback_data: 'diary.symptom.open' }]] },
      });
    });
  });
});
