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

  it('handles notifications.get and notifications.toggle', async () => {
    const readDb = vi.fn().mockResolvedValue({ notify_spb: true, notify_msk: false, notify_online: false });
    const writeDb = vi.fn().mockResolvedValue(undefined);

    const getResult = await executeAction({
      id: 'a9',
      type: 'notifications.get',
      mode: 'sync',
      params: { channelId: '123' },
    }, ctx, { readPort: { readDb } });

    expect(getResult.values).toEqual({ notifications: { notify_spb: true, notify_msk: false, notify_online: false } });

    const toggleResult = await executeAction({
      id: 'a10',
      type: 'notifications.toggle',
      mode: 'sync',
      params: { channelId: '123', toggleKey: 'notify_toggle_msk', supportsToggleAll: true },
    }, ctx, { readPort: { readDb }, writePort: { writeDb } });

    expect(toggleResult.values).toEqual({ notifications: { notify_spb: true, notify_msk: true, notify_online: false } });
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
      values: { notifications: { notify_spb: true, notify_msk: false, notify_online: false } },
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
      values: { notifications: { notify_spb: false, notify_msk: true, notify_online: false } },
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

  it('lowers telegram presentation actions to message.send', async () => {
    const templatePort = {
      renderTemplate: vi.fn().mockImplementation(async ({ templateId }) => ({
        text: templateId === 'chooseMenu'
          ? 'Выберите действие'
          : templateId === 'menu.book'
            ? '📅 Запись на приём'
            : templateId === 'moreMenu.notifications'
              ? '🔔 Настройки уведомлений'
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
});
