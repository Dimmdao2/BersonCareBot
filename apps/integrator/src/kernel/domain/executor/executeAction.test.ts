import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../config/appTimezone.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../config/appTimezone.js')>();
  return {
    ...actual,
    getAppDisplayTimezone: vi.fn(() => Promise.resolve('Europe/Moscow')),
  };
});

const enqueueReminderOutboxMock = vi.hoisted(() => vi.fn().mockResolvedValue(true));
vi.mock('../../../infra/db/repos/outgoingDeliveryQueue.js', () => ({
  enqueueOutgoingDeliveryIfAbsent: enqueueReminderOutboxMock,
}));

vi.mock('../reminders/reminderMessengerWebAppUrls.js', () => ({
  buildExerciseReminderWebAppUrls: vi.fn().mockResolvedValue({
    primaryWebAppUrl: 'https://app.test/app/tg?t=1&next=%2Fpatient',
    scheduleWebAppUrl: 'https://app.test/app/tg?t=1&next=%2Fprofile',
  }),
}));

import type { Action, DbReadPort, DomainContext, RemindersWebappWritesPort } from '../../contracts/index.js';
import { executeAction } from './executeAction.js';
import { resolveTargets } from './helpers.js';

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

  it('fans out rubitime message.send to multiple channels when deliveryTargetsPort returns bindings', async () => {
    const deliveryTargetsPort = {
      getTargetsByPhone: async () => ({ telegramId: '123', maxId: '456' }),
      getTargetsByChannelBinding: async () => null,
    };
    const result = await executeAction(
      {
        id: 'a6d',
        type: 'message.send',
        mode: 'async',
        params: {
          recipient: { phoneNormalized: '+79990001122' },
          recipientPolicy: { lookupByPhone: true },
          message: { text: 'Booking confirmed' },
          delivery: { channels: ['telegram'], maxAttempts: 1 },
        },
      },
      {
        ...ctx,
        event: {
          ...ctx.event,
          meta: { ...ctx.event.meta, source: 'rubitime' },
          payload: { incoming: { phone: '89643805480', action: 'created' } },
        },
      },
      { deliveryTargetsPort }
    );
    expect(result.status).toBe('success');
    expect(result.intents).toHaveLength(2);
    const telegramIntent = result.intents?.find(
      (i) => i.type === 'message.send' && (i.payload as { delivery?: { channels?: string[] } }).delivery?.channels?.[0] === 'telegram'
    );
    const maxIntent = result.intents?.find(
      (i) => i.type === 'message.send' && (i.payload as { delivery?: { channels?: string[] } }).delivery?.channels?.[0] === 'max'
    );
    expect(telegramIntent?.payload).toMatchObject({
      recipient: { chatId: 123 },
      delivery: { channels: ['telegram'], maxAttempts: 1 },
      message: { text: 'Booking confirmed' },
    });
    expect(maxIntent?.payload).toMatchObject({
      recipient: { chatId: 456 },
      delivery: { channels: ['max'], maxAttempts: 1 },
      message: { text: 'Booking confirmed' },
    });
  });

  it('rubitime fan-out: max intent omits auto main inline (menus.main Запись/Приложение disabled for MAX)', async () => {
    const deliveryTargetsPort = {
      getTargetsByPhone: async () => ({ telegramId: '123', maxId: '456' }),
      getTargetsByChannelBinding: async () => null,
    };
    const templatePort = {
      renderTemplate: vi.fn().mockImplementation(async ({ templateId }: { templateId: string }) => {
        if (templateId === 'menu.book') return { text: '📅 Запись' };
        if (templateId === 'menu.app') return { text: 'Приложение' };
        return { text: '' };
      }),
    };
    const contentPort = {
      getTemplate: vi.fn(),
      getBundle: vi.fn().mockImplementation(async (scope: { source: string }) => {
        if (scope.source === 'max') {
          return {
            scripts: [],
            templates: {},
            menus: {
              main: [[
                { textTemplateKey: 'max:menu.book', callbackData: 'booking.open' },
                { textTemplateKey: 'max:menu.app', webAppUrlFact: 'links.webappHomeUrl' },
              ]],
            },
          };
        }
        return { scripts: [], templates: {} };
      }),
    };
    const result = await executeAction(
      {
        id: 'a6d-menu-split',
        type: 'message.send',
        mode: 'async',
        params: {
          recipient: { phoneNormalized: '+79990001122' },
          recipientPolicy: { lookupByPhone: true },
          message: { text: 'Booking confirmed' },
          delivery: { channels: ['telegram'], maxAttempts: 1 },
        },
      },
      {
        ...ctx,
        base: {
          ...ctx.base,
          linkedPhone: true,
          facts: { links: { bookingUrl: 'https://app.example/book', webappHomeUrl: 'https://app.example/home' } },
        },
        event: {
          ...ctx.event,
          meta: { ...ctx.event.meta, source: 'rubitime' },
          payload: { incoming: { phone: '89643805480', action: 'created' } },
        },
      },
      { deliveryTargetsPort, contentPort, templatePort },
    );
    const telegramIntent = result.intents?.find(
      (i) => i.type === 'message.send' && (i.payload as { delivery?: { channels?: string[] } }).delivery?.channels?.[0] === 'telegram',
    );
    const maxIntent = result.intents?.find(
      (i) => i.type === 'message.send' && (i.payload as { delivery?: { channels?: string[] } }).delivery?.channels?.[0] === 'max',
    );
    expect((telegramIntent?.payload as { replyMarkup?: unknown }).replyMarkup).toBeUndefined();
    expect((maxIntent?.payload as { replyMarkup?: unknown }).replyMarkup).toBeUndefined();
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
    const writeDb = vi.fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ userPhoneLinkApplied: true });

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
    expect(phoneResult.writes?.[0]?.type).toBe('user.phone.link');
    expect(writeDb).toHaveBeenCalledTimes(2);
  });

  it('user.phone.link no_channel_binding: dedicated copy', async () => {
    const writeDb = vi.fn().mockResolvedValue({
      userPhoneLinkApplied: false,
      phoneLinkReason: 'no_channel_binding',
    });
    const messageCtx: DomainContext = {
      ...ctx,
      event: {
        type: 'message.received',
        meta: { ...ctx.event.meta, source: 'telegram' },
        payload: {
          incoming: {
            channelUserId: '123',
            chatId: 999001,
            contactPhone: '+79191234567',
          },
        },
      },
    };
    const result = await executeAction(
      {
        id: 'phone-no-binding',
        type: 'user.phone.link',
        mode: 'sync',
        params: { channelUserId: '123', phoneNormalized: '+79191234567' },
      },
      messageCtx,
      { writePort: { writeDb } },
    );
    expect(result.abortPlan).toBe(true);
    expect(result.intents?.[0]?.payload).toMatchObject({
      message: {
        text: 'Сначала откройте приложение из этого бота (кнопка меню), затем снова поделитесь контактом.',
      },
    });
    expect((result.intents?.[0]?.payload as { replyMarkup?: unknown }).replyMarkup).toBeUndefined();
  });

  it('user.phone.link no_channel_binding: webapp CTA when facts.links.webappHomeUrl present (telegram)', async () => {
    const writeDb = vi.fn().mockResolvedValue({
      userPhoneLinkApplied: false,
      phoneLinkReason: 'no_channel_binding',
    });
    const messageCtx: DomainContext = {
      ...ctx,
      base: {
        ...ctx.base,
        facts: { links: { webappHomeUrl: 'https://app.example/mini' } },
      },
      event: {
        type: 'message.received',
        meta: { ...ctx.event.meta, source: 'telegram' },
        payload: {
          incoming: {
            channelUserId: '123',
            chatId: 999001,
            contactPhone: '+79191234567',
          },
        },
      },
    };
    const result = await executeAction(
      {
        id: 'phone-no-binding-cta',
        type: 'user.phone.link',
        mode: 'sync',
        params: { channelUserId: '123', phoneNormalized: '+79191234567' },
      },
      messageCtx,
      { writePort: { writeDb } },
    );
    expect(result.abortPlan).toBe(true);
    expect(result.intents?.[0]?.payload).toMatchObject({
      replyMarkup: {
        inline_keyboard: [[{ text: 'Открыть мини-приложение', web_app: { url: 'https://app.example/mini' } }]],
      },
    });
  });

  it('user.phone.link no_channel_binding: webapp CTA when facts present (max)', async () => {
    const writeDb = vi.fn().mockResolvedValue({
      userPhoneLinkApplied: false,
      phoneLinkReason: 'no_channel_binding',
    });
    const messageCtx: DomainContext = {
      ...ctx,
      base: {
        ...ctx.base,
        facts: { links: { webappHomeUrl: 'https://app.example/max' } },
      },
      event: {
        type: 'message.received',
        meta: { ...ctx.event.meta, source: 'max' },
        payload: {
          incoming: {
            channelUserId: '123',
            chatId: 999002,
            contactPhone: '+79191234567',
          },
        },
      },
    };
    const result = await executeAction(
      {
        id: 'phone-no-binding-max',
        type: 'user.phone.link',
        mode: 'sync',
        params: { channelUserId: '123', phoneNormalized: '+79191234567' },
      },
      messageCtx,
      { writePort: { writeDb } },
    );
    expect(result.abortPlan).toBe(true);
    expect(result.intents?.[0]?.payload).toMatchObject({
      delivery: { channels: ['max'] },
      replyMarkup: {
        inline_keyboard: [[{ text: 'Открыть мини-приложение', web_app: { url: 'https://app.example/max' } }]],
      },
    });
  });

  it('user.phone.link no_integrator_identity: resync copy, not conflict or generic save-failed', async () => {
    const writeDb = vi.fn().mockResolvedValue({
      userPhoneLinkApplied: false,
      phoneLinkReason: 'no_integrator_identity',
    });
    const messageCtx: DomainContext = {
      ...ctx,
      event: {
        type: 'message.received',
        meta: { ...ctx.event.meta, source: 'telegram' },
        payload: {
          incoming: {
            channelUserId: '123',
            chatId: 999001,
            contactPhone: '+79191234567',
          },
        },
      },
    };
    const result = await executeAction(
      {
        id: 'phone-no-identity',
        type: 'user.phone.link',
        mode: 'sync',
        params: { channelUserId: '123', phoneNormalized: '+79191234567' },
      },
      messageCtx,
      { writePort: { writeDb } },
    );
    expect(result.abortPlan).toBe(true);
    expect(result.intents?.[0]?.payload).toMatchObject({
      message: {
        text: 'Сессия бота не синхронизирована. Откройте мини-приложение из этого бота или отправьте /start, затем снова поделитесь контактом.',
      },
    });
  });

  it('user.phone.link not applied without phoneLinkReason: save-failed copy, abortPlan, no success writes', async () => {
    const writeDb = vi.fn().mockResolvedValue({ userPhoneLinkApplied: false });
    const messageCtx: DomainContext = {
      ...ctx,
      event: {
        type: 'message.received',
        meta: { ...ctx.event.meta, source: 'telegram' },
        payload: {
          incoming: {
            channelUserId: '123',
            chatId: 999001,
            contactPhone: '+79191234567',
          },
        },
      },
    };
    const result = await executeAction(
      {
        id: 'phone-conflict',
        type: 'user.phone.link',
        mode: 'sync',
        params: { channelUserId: '123', phoneNormalized: '+79191234567' },
      },
      messageCtx,
      { writePort: { writeDb } },
    );
    expect(result.status).toBe('success');
    expect(result.abortPlan).toBe(true);
    expect(result.writes).toBeUndefined();
    expect(result.intents?.[0]?.payload).toMatchObject({
      recipient: { chatId: 999001 },
      message: {
        text: 'Не удалось сохранить номер. Попробуйте позже или напишите в поддержку.',
      },
    });
  });

  it('user.phone.link integrator_id_mismatch: support copy, not conflict', async () => {
    const writeDb = vi.fn().mockResolvedValue({
      userPhoneLinkApplied: false,
      phoneLinkReason: 'integrator_id_mismatch',
    });
    const messageCtx: DomainContext = {
      ...ctx,
      event: {
        type: 'message.received',
        meta: { ...ctx.event.meta, source: 'telegram' },
        payload: {
          incoming: {
            channelUserId: '123',
            chatId: 999001,
            contactPhone: '+79191234567',
          },
        },
      },
    };
    const result = await executeAction(
      {
        id: 'phone-integ-mismatch',
        type: 'user.phone.link',
        mode: 'sync',
        params: { channelUserId: '123', phoneNormalized: '+79191234567' },
      },
      messageCtx,
      { writePort: { writeDb } },
    );
    expect(result.abortPlan).toBe(true);
    expect(result.intents?.[0]?.payload).toMatchObject({
      message: {
        text: 'Не удалось сопоставить аккаунт с приложением. Напишите в поддержку.',
      },
    });
  });

  it('user.phone.link phone_owned_by_other_user: conflict copy when reason explicit', async () => {
    const writeDb = vi.fn().mockResolvedValue({
      userPhoneLinkApplied: false,
      phoneLinkReason: 'phone_owned_by_other_user',
    });
    const messageCtx: DomainContext = {
      ...ctx,
      event: {
        type: 'message.received',
        meta: { ...ctx.event.meta, source: 'telegram' },
        payload: {
          incoming: {
            channelUserId: '123',
            chatId: 999001,
            contactPhone: '+79191234567',
          },
        },
      },
    };
    const result = await executeAction(
      {
        id: 'phone-owned-other',
        type: 'user.phone.link',
        mode: 'sync',
        params: { channelUserId: '123', phoneNormalized: '+79191234567' },
      },
      messageCtx,
      { writePort: { writeDb } },
    );
    expect(result.abortPlan).toBe(true);
    expect(result.intents?.[0]?.payload).toMatchObject({
      message: {
        text: 'Данный номер уже привязан к другому аккаунту Telegram. Напишите в поддержку для решения вопроса.',
      },
    });
  });

  it('user.phone.link db_transient_failure: save-failed copy, not conflict', async () => {
    const writeDb = vi.fn().mockResolvedValue({
      userPhoneLinkApplied: false,
      phoneLinkReason: 'db_transient_failure',
      phoneLinkIndeterminate: true,
    });
    const messageCtx: DomainContext = {
      ...ctx,
      event: {
        type: 'message.received',
        meta: { ...ctx.event.meta, source: 'telegram' },
        payload: {
          incoming: {
            channelUserId: '123',
            chatId: 999001,
            contactPhone: '+79191234567',
          },
        },
      },
    };
    const result = await executeAction(
      {
        id: 'phone-db-transient',
        type: 'user.phone.link',
        mode: 'sync',
        params: { channelUserId: '123', phoneNormalized: '+79191234567' },
      },
      messageCtx,
      { writePort: { writeDb } },
    );
    expect(result.abortPlan).toBe(true);
    expect(result.intents?.[0]?.payload).toMatchObject({
      message: {
        text: 'Не удалось сохранить номер. Попробуйте позже или напишите в поддержку.',
      },
    });
  });

  it('user.phone.link indeterminate: generic save-failed copy when writeDb omits metadata', async () => {
    const writeDb = vi.fn().mockResolvedValue(undefined);
    const messageCtx: DomainContext = {
      ...ctx,
      event: {
        type: 'message.received',
        meta: { ...ctx.event.meta, source: 'telegram' },
        payload: {
          incoming: {
            channelUserId: '123',
            chatId: 999001,
            contactPhone: '+79191234567',
          },
        },
      },
    };
    const result = await executeAction(
      {
        id: 'phone-indeterminate',
        type: 'user.phone.link',
        mode: 'sync',
        params: { channelUserId: '123', phoneNormalized: '+79191234567' },
      },
      messageCtx,
      { writePort: { writeDb } },
    );
    expect(result.status).toBe('success');
    expect(result.abortPlan).toBe(true);
    expect(result.writes).toBeUndefined();
    expect(result.intents?.[0]?.payload).toMatchObject({
      recipient: { chatId: 999001 },
      message: { text: 'Не удалось сохранить номер. Попробуйте позже или напишите в поддержку.' },
    });
  });

  it('falls back to incoming actor and contact when linking phone', async () => {
    const writeDb = vi.fn().mockResolvedValue({ userPhoneLinkApplied: true });
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
    const readDb = vi.fn()
      .mockResolvedValueOnce({
        id: 'draft-1',
        source: 'telegram',
        channel_id: '123',
        username: 'alice',
        first_name: 'Alice',
        last_name: 'Example',
        external_chat_id: '123',
        external_message_id: '55',
        draft_text_current: 'Последний текст вопроса',
      })
      .mockResolvedValueOnce(null);
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
    expect(readDb).toHaveBeenCalledWith({
      type: 'conversation.openByIdentity',
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

  it('draft.send appends to existing open conversation and cancels draft', async () => {
    const writeDb = vi.fn().mockResolvedValue(undefined);
    const draftRow = {
      id: 'draft-1',
      source: 'telegram',
      channel_id: '123',
      username: 'alice',
      first_name: 'Alice',
      last_name: 'Example',
      external_chat_id: '123',
      external_message_id: '55',
      draft_text_current: 'Дополнение к диалогу',
    };
    const openConv = {
      id: 'conv-open',
      source: 'telegram',
      status: 'waiting_admin',
      user_channel_id: '123',
      username: 'alice',
      first_name: 'Alice',
      last_name: 'Example',
    };
    const readDb = vi.fn()
      .mockResolvedValueOnce(draftRow)
      .mockResolvedValueOnce(openConv)
      .mockResolvedValueOnce(openConv);

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
            action: 'q_confirm:yes',
            callbackQueryId: 'cb-append',
          },
        },
      },
      base: {
        ...ctx.base,
        facts: { adminChatId: 999 },
      },
    };

    const result = await executeAction({
      id: 'draft-send-append',
      type: 'draft.send',
      mode: 'sync',
      params: {
        source: 'telegram',
        adminTemplateKey: 'telegram:adminForward',
      },
    }, draftCtx, {
      readPort: { readDb },
      writePort: { writeDb },
      templatePort: {
        renderTemplate: vi.fn().mockResolvedValue({ text: 'x' }),
      },
    });

    expect(result.status).toBe('success');
    expect(writeDb).toHaveBeenCalledWith(expect.objectContaining({ type: 'draft.cancel' }));
    expect(writeDb).toHaveBeenCalledWith(expect.objectContaining({
      type: 'conversation.message.add',
      params: expect.objectContaining({
        conversationId: 'conv-open',
        text: 'Дополнение к диалогу',
      }),
    }));
    expect(writeDb).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'conversation.open' }));
    expect(result.values?.hasActiveDraft).toBe(false);
    expect(result.intents?.some((i) => i.type === 'message.send')).toBe(true);
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
        replyMarkup: {
          keyboard: [[{ text: '📅 Запись на приём' }]],
          resize_keyboard: true,
          one_time_keyboard: false,
          is_persistent: true,
        },
      },
    });

    const replyKeyboardWithWebAppResult = await executeAction({
      id: 'a14webapp',
      type: 'message.replyKeyboard.show',
      mode: 'async',
      params: {
        chatId: 321,
        templateKey: 'telegram:chooseMenu',
        keyboard: [[{ textTemplateKey: 'telegram:menu.more', webAppUrlFact: 'links.webappRemindersUrl' }]],
        resizeKeyboard: true,
      },
    }, {
      ...ctx,
      base: {
        ...ctx.base,
        facts: { links: { webappRemindersUrl: 'https://webapp.example/app/tg?t=dummy' } },
      },
    }, {
      templatePort: {
        renderTemplate: vi.fn().mockImplementation(async ({ templateId }) => ({
          text: templateId === 'chooseMenu'
            ? 'Выберите действие'
            : templateId === 'menu.more'
              ? 'Помощник'
              : '',
        })),
      },
    });

    expect(replyKeyboardWithWebAppResult.intents?.[0]).toMatchObject({
      type: 'message.send',
      payload: {
        recipient: { chatId: 321 },
        message: { text: 'Выберите действие' },
        replyMarkup: {
          keyboard: [[{ text: 'Помощник', web_app: { url: 'https://webapp.example/app/tg?t=dummy' } }]],
          resize_keyboard: true,
          one_time_keyboard: false,
          is_persistent: true,
        },
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
        inlineKeyboard: [[{ textTemplateKey: 'telegram:menu.book', callbackData: 'booking.open' }]],
      },
    }, ctx, { templatePort });

    expect(inlineKeyboardResult.intents?.[0]).toMatchObject({
      type: 'message.send',
      payload: {
        recipient: { chatId: 123 },
        message: { text: 'inline' },
        replyMarkup: { inline_keyboard: [[{ text: '📅 Запись на приём', callback_data: 'booking.open' }]] },
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
    const homeUrl = 'https://app.example/home';
    const templatePort = {
      renderTemplate: vi.fn().mockImplementation(async ({ templateId }) => ({
        text: templateId === 'questionAccepted'
          ? 'Вопрос принят. Я отвечу вам в ближайшее время.'
          : templateId === 'menu.book'
            ? '📅 Запись на приём'
            : templateId === 'menu.app'
              ? 'Приложение'
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
    }, {
      ...ctx,
      base: {
        ...ctx.base,
        linkedPhone: true,
        facts: { ...(ctx.base.facts ?? {}), links: { webappHomeUrl: homeUrl } },
      },
      event: { ...ctx.event, meta: { ...ctx.event.meta, source: 'telegram' }, payload: { incoming: { text: 'question', chatId: 123 } } },
    }, {
      templatePort,
      sendMenuOnButtonPress: true,
      contentPort: {
        getTemplate: vi.fn(),
        getBundle: vi.fn().mockResolvedValue({
          scripts: [],
          templates: {},
          mainReplyKeyboard: [[
            { textTemplateKey: 'telegram:menu.book' },
            { textTemplateKey: 'telegram:menu.app', webAppUrlFact: 'links.webappHomeUrl' },
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
            { text: 'Приложение', web_app: { url: homeUrl } },
          ]],
          resize_keyboard: true,
          one_time_keyboard: false,
          is_persistent: true,
        },
      },
    });
  });

  it('attaches main reply keyboard when user pressed Помощник or Запись на приём', async () => {
    const homeUrl = 'https://app.example/home';
    const templatePort = {
      renderTemplate: vi.fn().mockImplementation(async ({ templateId }) => ({
        text: templateId === 'menu.more'
          ? 'Помощник'
          : templateId === 'menu.book'
            ? '📅 Запись на приём'
            : templateId === 'menu.app'
              ? 'Приложение'
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
    }, {
      ...ctx,
      base: {
        ...ctx.base,
        linkedPhone: true,
        facts: { ...(ctx.base.facts ?? {}), links: { webappHomeUrl: homeUrl } },
      },
      event: { ...ctx.event, meta: { ...ctx.event.meta, source: 'telegram' }, payload: { incoming: { action: 'menu.more', text: 'Помощник', chatId: 123 } } },
    }, {
      templatePort,
      sendMenuOnButtonPress: true,
      contentPort: {
        getTemplate: vi.fn(),
        getBundle: vi.fn().mockResolvedValue({
          scripts: [],
          templates: {},
          mainReplyKeyboard: [[
            { textTemplateKey: 'telegram:menu.book' },
            { textTemplateKey: 'telegram:menu.app', webAppUrlFact: 'links.webappHomeUrl' },
          ]],
        }),
      },
    });

    expect(result.intents?.[0]).toMatchObject({
      type: 'message.send',
      payload: {
        recipient: { chatId: 123 },
        message: { text: 'Помощник' },
        replyMarkup: {
          keyboard: [[
            { text: '📅 Запись на приём' },
            { text: 'Приложение', web_app: { url: homeUrl } },
          ]],
          resize_keyboard: true,
          one_time_keyboard: false,
          is_persistent: true,
        },
      },
    });
  });

  it('does not attach main reply keyboard when linkedPhone is false (contact gate)', async () => {
    const templatePort = {
      renderTemplate: vi.fn().mockImplementation(async ({ templateId }) => ({
        text: templateId === 'questionAccepted'
          ? 'Вопрос принят. Я отвечу вам в ближайшее время.'
          : '',
      })),
    };

    const result = await executeAction({
      id: 'a17c',
      type: 'message.send',
      mode: 'async',
      params: {
        recipient: { chatId: 123 },
        templateKey: 'telegram:questionAccepted',
        delivery: { channels: ['telegram'], maxAttempts: 1 },
      },
    }, {
      ...ctx,
      base: { ...ctx.base, linkedPhone: false },
      event: { ...ctx.event, meta: { ...ctx.event.meta, source: 'telegram' }, payload: { incoming: { text: 'question', chatId: 123 } } },
    }, {
      templatePort,
      sendMenuOnButtonPress: true,
      contentPort: {
        getTemplate: vi.fn(),
        getBundle: vi.fn().mockResolvedValue({
          scripts: [],
          templates: {},
          mainReplyKeyboard: [[
            { textTemplateKey: 'telegram:menu.book' },
            { textTemplateKey: 'telegram:menu.app', webAppUrlFact: 'links.webappHomeUrl' },
          ]],
        }),
      },
    });

    expect(result.intents?.[0]).toMatchObject({
      type: 'message.send',
      payload: {
        recipient: { chatId: 123 },
        message: { text: 'Вопрос принят. Я отвечу вам в ближайшее время.' },
      },
    });
    expect((result.intents?.[0]?.payload as { replyMarkup?: unknown }).replyMarkup).toBeUndefined();
  });

  it('does not attach max menus.main inline (Запись/Приложение) to message.send for max when linkedPhone', async () => {
    const templatePort = {
      renderTemplate: vi.fn().mockImplementation(async ({ templateId }: { templateId: string }) => {
        const id = String(templateId);
        if (id === 'questionAccepted') return { text: 'Вопрос принят.' };
        if (id === 'menu.book') return { text: '📅 Запись на приём' };
        if (id === 'menu.app') return { text: 'Приложение' };
        return { text: '' };
      }),
    };
    const webappHomeUrl = 'https://app.example/home';
    const result = await executeAction({
      id: 'max-inline-main-1',
      type: 'message.send',
      mode: 'async',
      params: {
        recipient: { chatId: 999 },
        templateKey: 'max:questionAccepted',
        delivery: { channels: ['max'], maxAttempts: 1 },
      },
    }, {
      ...ctx,
      base: {
        ...ctx.base,
        linkedPhone: true,
        facts: {
          links: {
            webappHomeUrl,
          },
        },
      },
      event: {
        ...ctx.event,
        meta: { ...ctx.event.meta, source: 'max' },
        payload: { incoming: { chatId: 999 } },
      },
    }, {
      templatePort,
      contentPort: {
        getTemplate: vi.fn(),
        getBundle: vi.fn().mockImplementation(async (scope: { source: string }) => {
          if (scope.source === 'max') {
            return {
              scripts: [],
              templates: {},
              menus: {
                main: [[
                  { textTemplateKey: 'max:menu.book', callbackData: 'booking.open' },
                  { textTemplateKey: 'max:menu.app', webAppUrlFact: 'links.webappHomeUrl' },
                ]],
              },
            };
          }
          return { scripts: [], templates: {} };
        }),
      },
    });

    expect(
      (result.intents?.[0]?.payload as { replyMarkup?: unknown }).replyMarkup,
    ).toBeUndefined();
  });

  it('does not attach max main inline when delivery is telegram only', async () => {
    const templatePort = {
      renderTemplate: vi.fn().mockResolvedValue({ text: 'ok' }),
    };
    const result = await executeAction({
      id: 'max-inline-skip-tg',
      type: 'message.send',
      mode: 'async',
      params: {
        recipient: { chatId: 1 },
        templateKey: 'telegram:questionAccepted',
        delivery: { channels: ['telegram'], maxAttempts: 1 },
      },
    }, {
      ...ctx,
      base: { ...ctx.base, linkedPhone: true, facts: { links: { bookingUrl: 'https://x' } } },
      event: { ...ctx.event, meta: { ...ctx.event.meta, source: 'telegram' } },
    }, {
      templatePort,
      contentPort: {
        getTemplate: vi.fn(),
        getBundle: vi.fn().mockResolvedValue({
          scripts: [],
          templates: {},
          menus: {
            main: [[{ textTemplateKey: 'max:menu.book', webAppUrlFact: 'links.bookingUrl' }]],
          },
        }),
      },
    });

    expect((result.intents?.[0]?.payload as { replyMarkup?: unknown }).replyMarkup).toBeUndefined();
  });

  it('sends single intent for inline keyboard (no follow-up reply menu)', async () => {
    const templatePort = {
      renderTemplate: vi.fn().mockImplementation(async ({ templateId }) => ({
        text: templateId === 'menu.book'
          ? '📅 Запись на приём'
          : templateId === 'menu.more'
            ? 'Помощник'
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
        inlineKeyboard: [[{ textTemplateKey: 'telegram:menu.book', callbackData: 'booking.open' }]],
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
            { textTemplateKey: 'telegram:menu.app', webAppUrlFact: 'links.webappHomeUrl' },
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
        replyMarkup: { inline_keyboard: [[{ text: '📅 Запись на приём', callback_data: 'booking.open' }]] },
      },
    });
  });

  it('sends single intent for message.edit (no follow-up reply menu)', async () => {
    const templatePort = {
      renderTemplate: vi.fn().mockImplementation(async ({ templateId }) => ({
        text: templateId === 'menu.book'
          ? '📅 Запись на приём'
          : templateId === 'menu.more'
            ? 'Помощник'
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
            { textTemplateKey: 'telegram:menu.app', webAppUrlFact: 'links.webappHomeUrl' },
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

    it('conversation.user.message: explicit params.text skips message.copy (e.g. after draft confirm)', async () => {
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
          type: 'callback.received',
          meta: { ...ctx.event.meta, source: 'telegram', userId: '123' },
          payload: {
            incoming: {
              chatId: 123,
              channelUserId: 123,
              messageId: 777,
              callbackQueryId: 'cb-1',
            },
          },
        },
        base: { ...ctx.base, facts: { adminChatId: 999 } },
      };
      const result = await executeAction({
        id: 'u-explicit-text',
        type: 'conversation.user.message',
        mode: 'sync',
        params: { source: 'telegram', text: 'Текст из черновика' },
      }, userCtx, {
        readPort: { readDb },
        writePort: { writeDb },
        supportRelayPolicy: createSupportRelayPolicy(['text', 'photo'], ['text']),
      });
      expect(result.status).toBe('success');
      expect(result.intents?.some((i) => i.type === 'message.copy')).toBe(false);
      expect(result.intents?.some(
        (i) => i.type === 'message.send'
          && (i.payload as { message?: { text?: string } }).message?.text === 'Текст из черновика',
      )).toBe(true);
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

  it('webapp.channelLink.complete dispatches contact request for Max when needsPhone', async () => {
    const completeChannelLink = vi.fn().mockResolvedValue({ ok: true, needsPhone: true });
    const dispatchOutgoing = vi.fn().mockResolvedValue(undefined);
    const webappEventsPort = {
      completeChannelLink,
      emit: vi.fn(),
      listSymptomTrackings: vi.fn(),
      listLfkComplexes: vi.fn(),
    };
    const action: Action = {
      id: 'cl-max',
      type: 'webapp.channelLink.complete',
      mode: 'sync',
      params: { linkToken: 'tok', channelCode: 'max', externalId: 'max-42' },
    };
    const result = await executeAction(action, ctx, {
      webappEventsPort,
      dispatchPort: { dispatchOutgoing },
    });
    expect(completeChannelLink).toHaveBeenCalledWith({
      linkToken: 'tok',
      channelCode: 'max',
      externalId: 'max-42',
    });
    expect(dispatchOutgoing).toHaveBeenCalled();
    expect(result.status).toBe('success');
    expect((result.values as { channelLink?: { contactPromptSent?: boolean } }).channelLink?.contactPromptSent).toBe(
      true,
    );
  });

  it('webapp.channelLink.complete fails for Telegram when needsPhone without writePort', async () => {
    const completeChannelLink = vi.fn().mockResolvedValue({ ok: true, needsPhone: true });
    const dispatchOutgoing = vi.fn();
    const webappEventsPort = {
      completeChannelLink,
      emit: vi.fn(),
      listSymptomTrackings: vi.fn(),
      listLfkComplexes: vi.fn(),
    };
    const action: Action = {
      id: 'cl-tg',
      type: 'webapp.channelLink.complete',
      mode: 'sync',
      params: { linkToken: 'tok', channelCode: 'telegram', externalId: '99' },
    };
    const result = await executeAction(action, ctx, {
      webappEventsPort,
      dispatchPort: { dispatchOutgoing },
    });
    expect(result.status).toBe('failed');
    expect(dispatchOutgoing).not.toHaveBeenCalled();
  });

  it('webapp.channelLink.complete adds message.send intent when complete fails (Telegram)', async () => {
    const completeChannelLink = vi.fn().mockResolvedValue({ ok: false, error: 'conflict' });
    const webappEventsPort = {
      completeChannelLink,
      emit: vi.fn(),
      listSymptomTrackings: vi.fn(),
      listLfkComplexes: vi.fn(),
    };
    const tgCtx: DomainContext = {
      ...ctx,
      event: {
        type: 'message.received',
        meta: {
          eventId: 'evt-cl-fail',
          occurredAt: '2026-04-11T12:00:00.000Z',
          source: 'telegram',
          userId: '111',
        },
        payload: {
          incoming: {
            kind: 'message',
            text: '/start link_testtoken',
            chatId: 111,
            channelId: '111',
            action: 'start.link',
            linkSecret: 'link_testtoken',
            userRow: null,
            userState: '',
          },
        },
      },
    };
    const action: Action = {
      id: 'cl-tg-fail',
      type: 'webapp.channelLink.complete',
      mode: 'sync',
      params: { linkToken: 'link_testtoken', channelCode: 'telegram', externalId: '111' },
    };
    const renderTemplate = vi.fn().mockResolvedValue({
      text: 'Привязка не выполнена (конфликт).',
    });
    const result = await executeAction(action, tgCtx, {
      webappEventsPort,
      templatePort: { renderTemplate },
    });
    expect(result.status).toBe('failed');
    expect(renderTemplate).toHaveBeenCalled();
    const send = result.intents?.find((i) => i.type === 'message.send');
    expect(send).toBeDefined();
    expect((send?.payload as { message?: { text?: string } })?.message?.text).toContain('конфликт');
    expect((send?.payload as { recipient?: { chatId?: number } })?.recipient?.chatId).toBe(111);
  });

  it('webapp.channelLink.complete uses generic failure template when error is channel_link_claim_failed', async () => {
    const completeChannelLink = vi.fn().mockResolvedValue({ ok: false, error: 'channel_link_claim_failed' });
    const webappEventsPort = {
      completeChannelLink,
      emit: vi.fn(),
      listSymptomTrackings: vi.fn(),
      listLfkComplexes: vi.fn(),
    };
    const tgCtx: DomainContext = {
      ...ctx,
      event: {
        type: 'message.received',
        meta: {
          eventId: 'evt-cl-fail-gen',
          occurredAt: '2026-04-11T12:00:00.000Z',
          source: 'telegram',
          userId: '111',
        },
        payload: {
          incoming: {
            kind: 'message',
            text: '/start link_testtoken',
            chatId: 111,
            channelId: '111',
            action: 'start.link',
            linkSecret: 'link_testtoken',
            userRow: null,
            userState: '',
          },
        },
      },
    };
    const action: Action = {
      id: 'cl-tg-fail-gen',
      type: 'webapp.channelLink.complete',
      mode: 'sync',
      params: { linkToken: 'link_testtoken', channelCode: 'telegram', externalId: '111' },
    };
    const renderTemplate = vi.fn().mockResolvedValue({
      text: 'Не удалось завершить привязку (generic).',
    });
    const result = await executeAction(action, tgCtx, {
      webappEventsPort,
      templatePort: { renderTemplate },
    });
    expect(result.status).toBe('failed');
    expect(renderTemplate).toHaveBeenCalledWith(
      expect.objectContaining({
        templateId: 'channelLink.completeFailed.generic',
      }),
    );
    const send = result.intents?.find((i) => i.type === 'message.send');
    expect(send).toBeDefined();
  });

  it('webapp.channelLink.complete maps channel_owned_by_real_user to conflict failure template', async () => {
    const completeChannelLink = vi.fn().mockResolvedValue({ ok: false, error: 'channel_owned_by_real_user' });
    const webappEventsPort = {
      completeChannelLink,
      emit: vi.fn(),
      listSymptomTrackings: vi.fn(),
      listLfkComplexes: vi.fn(),
    };
    const tgCtx: DomainContext = {
      ...ctx,
      event: {
        type: 'message.received',
        meta: {
          eventId: 'evt-cl-fail-own',
          occurredAt: '2026-04-11T12:00:00.000Z',
          source: 'telegram',
          userId: '111',
        },
        payload: {
          incoming: {
            kind: 'message',
            text: '/start link_testtoken',
            chatId: 111,
            channelId: '111',
            action: 'start.link',
            linkSecret: 'link_testtoken',
            userRow: null,
            userState: '',
          },
        },
      },
    };
    const action: Action = {
      id: 'cl-tg-fail-own',
      type: 'webapp.channelLink.complete',
      mode: 'sync',
      params: { linkToken: 'link_testtoken', channelCode: 'telegram', externalId: '111' },
    };
    const renderTemplate = vi.fn().mockResolvedValue({
      text: 'Привязка не выполнена (ownership).',
    });
    const result = await executeAction(action, tgCtx, {
      webappEventsPort,
      templatePort: { renderTemplate },
    });
    expect(result.status).toBe('failed');
    expect(renderTemplate).toHaveBeenCalledWith(
      expect.objectContaining({
        templateId: 'channelLink.completeFailed.conflict',
      }),
    );
  });

  it('webapp.channelLink.complete syncs phone and sends welcome intents for Telegram when phone already on platform', async () => {
    const completeChannelLink = vi.fn().mockResolvedValue({
      ok: true,
      needsPhone: false,
      phoneNormalized: '+79990001122',
    });
    const writeDb = vi.fn().mockImplementation(async (mutation: { type: string }) => {
      if (mutation.type === 'user.phone.link') {
        return { userPhoneLinkApplied: true };
      }
      return undefined;
    });
    const webappEventsPort = {
      completeChannelLink,
      emit: vi.fn(),
      listSymptomTrackings: vi.fn(),
      listLfkComplexes: vi.fn(),
    };
    const tgCtx: DomainContext = {
      ...ctx,
      base: {
        ...ctx.base,
        facts: {
          links: {
            webappDiaryUrl: 'https://app.example/diary',
            webappHomeUrl: 'https://app.example/home',
          },
        },
      },
      event: {
        type: 'message.received',
        meta: {
          eventId: 'evt-cl',
          occurredAt: '2026-03-05T12:00:00.000Z',
          source: 'telegram',
          userId: '111',
        },
        payload: {
          incoming: {
            kind: 'message',
            text: '/start link_testtoken',
            chatId: 111,
            channelId: '111',
            action: 'start.link',
            linkSecret: 'link_testtoken',
            userRow: null,
            userState: '',
          },
        },
      },
    };
    const action: Action = {
      id: 'cl-tg-ok',
      type: 'webapp.channelLink.complete',
      mode: 'sync',
      params: { linkToken: 'link_testtoken', channelCode: 'telegram', externalId: '111' },
    };
    const renderTemplate = vi.fn().mockImplementation(async ({ templateId }: { templateId: string }) => {
      if (templateId === 'afterPhoneLinked') {
        return { text: 'Номер привязан. Вы можете остаться и продолжить в боте или вернуться в веб-приложение - возможности платформ одинаковые.' };
      }
      if (templateId === 'menu.book') return { text: '📅 Запись на приём' };
      if (templateId === 'menu.app') return { text: 'Приложение' };
      return { text: '' };
    });
    const result = await executeAction(action, tgCtx, {
      webappEventsPort,
      writePort: { writeDb },
      templatePort: { renderTemplate },
    });
    expect(result.status).toBe('success');
    expect(writeDb).toHaveBeenCalled();
    expect(writeDb).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'user.phone.link', params: expect.objectContaining({ resource: 'telegram' }) }),
    );
    expect(writeDb).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'user.state.set' }),
    );
    expect(renderTemplate).toHaveBeenCalled();
    const welcome = result.intents?.find((i) => i.type === 'message.send');
    expect(welcome).toBeDefined();
    expect((welcome?.payload as { message?: { text?: string } })?.message?.text).toContain('Номер привязан');
    const row = (welcome?.payload as { replyMarkup?: { keyboard?: unknown[][] } })?.replyMarkup?.keyboard?.[0];
    expect(row).toEqual([
      { text: '📅 Запись на приём' },
      { text: 'Приложение', web_app: { url: 'https://app.example/home' } },
    ]);
  });

  it('webapp.channelLink.complete sends afterChannelLinked for Max when phone already on platform', async () => {
    const completeChannelLink = vi.fn().mockResolvedValue({
      ok: true,
      needsPhone: false,
      phoneNormalized: '+79990001122',
    });
    const writeDb = vi.fn().mockImplementation(async (mutation: { type: string }) => {
      if (mutation.type === 'user.phone.link') {
        return { userPhoneLinkApplied: true };
      }
      return undefined;
    });
    const webappEventsPort = {
      completeChannelLink,
      emit: vi.fn(),
      listSymptomTrackings: vi.fn(),
      listLfkComplexes: vi.fn(),
    };
    const maxCtx: DomainContext = {
      ...ctx,
      event: {
        type: 'message.received',
        meta: {
          eventId: 'evt-cl-max',
          occurredAt: '2026-04-13T12:00:00.000Z',
          source: 'max',
          userId: '207278131',
        },
        payload: {
          incoming: {
            kind: 'message',
            text: '/start link_testtoken',
            chatId: 5090177,
            channelId: '207278131',
            action: 'start.link',
            linkSecret: 'link_testtoken',
          },
        },
      },
    };
    const action: Action = {
      id: 'cl-max-ok',
      type: 'webapp.channelLink.complete',
      mode: 'sync',
      params: { linkToken: 'link_testtoken', channelCode: 'max', externalId: '207278131' },
    };
    const renderTemplate = vi.fn().mockResolvedValue({
      text: '✅ Аккаунт MAX привязан к вашему профилю.',
    });
    const result = await executeAction(action, maxCtx, {
      webappEventsPort,
      writePort: { writeDb },
      templatePort: { renderTemplate },
    });
    expect(result.status).toBe('success');
    expect(writeDb).toHaveBeenCalled();
    expect(renderTemplate).toHaveBeenCalled();
    const send = result.intents?.find((i) => i.type === 'message.send');
    expect(send).toBeDefined();
    expect((send?.payload as { message?: { text?: string } })?.message?.text).toContain('привязан');
    expect((send?.payload as { delivery?: { channels?: string[] } }).delivery?.channels).toEqual(['max']);
  });

  it('webapp.channelLink.complete fails Max when user.phone.link returns not applied (no afterChannelLinked)', async () => {
    const completeChannelLink = vi.fn().mockResolvedValue({
      ok: true,
      needsPhone: false,
      phoneNormalized: '+79990001122',
    });
    const writeDb = vi.fn().mockResolvedValue({
      userPhoneLinkApplied: false,
      phoneLinkReason: 'integrator_id_mismatch',
    });
    const webappEventsPort = {
      completeChannelLink,
      emit: vi.fn(),
      listSymptomTrackings: vi.fn(),
      listLfkComplexes: vi.fn(),
    };
    const maxCtx: DomainContext = {
      ...ctx,
      event: {
        type: 'message.received',
        meta: {
          eventId: 'evt-cl-max-phone-fail',
          occurredAt: '2026-04-13T12:00:00.000Z',
          source: 'max',
          userId: '207278131',
        },
        payload: {
          incoming: {
            kind: 'message',
            text: '/start link_testtoken',
            chatId: 5090177,
            channelId: '207278131',
            action: 'start.link',
            linkSecret: 'link_testtoken',
          },
        },
      },
    };
    const action: Action = {
      id: 'cl-max-phone-fail',
      type: 'webapp.channelLink.complete',
      mode: 'sync',
      params: { linkToken: 'link_testtoken', channelCode: 'max', externalId: '207278131' },
    };
    const renderTemplate = vi.fn().mockResolvedValue({
      text: 'Не удалось завершить привязку (generic).',
    });
    const result = await executeAction(action, maxCtx, {
      webappEventsPort,
      writePort: { writeDb },
      templatePort: { renderTemplate },
    });
    expect(result.status).toBe('failed');
    expect(result.error).toContain('integrator_id_mismatch');
    expect(writeDb).toHaveBeenCalledTimes(1);
    expect(writeDb).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'user.phone.link', params: expect.objectContaining({ resource: 'max' }) }),
    );
    const afterLinked = result.intents?.find(
      (i) => i.type === 'message.send' && i.meta?.eventId?.includes('after-channel-linked'),
    );
    expect(afterLinked).toBeUndefined();
    expect(renderTemplate).toHaveBeenCalledWith(
      expect.objectContaining({
        templateId: 'channelLink.completeFailed.generic',
      }),
    );
    const failureSend = result.intents?.find(
      (i) => i.type === 'message.send' && i.meta?.eventId?.includes('channel-link-phone-sync-failed'),
    );
    expect(failureSend).toBeDefined();
    expect((failureSend?.payload as { message?: { text?: string } })?.message?.text).toContain('generic');
    expect(
      (result.values as { channelLink?: { ok?: boolean; webappComplete?: boolean } })?.channelLink?.ok,
    ).toBe(false);
    expect(
      (result.values as { channelLink?: { webappComplete?: boolean } })?.channelLink?.webappComplete,
    ).toBe(true);
  });

  it('webapp.channelLink.complete fails Telegram when user.phone.link not applied (no user.state.set, no welcome)', async () => {
    const completeChannelLink = vi.fn().mockResolvedValue({
      ok: true,
      needsPhone: false,
      phoneNormalized: '+79990001122',
    });
    const writeDb = vi.fn().mockResolvedValue({
      userPhoneLinkApplied: false,
      phoneLinkReason: 'integrator_id_mismatch',
    });
    const webappEventsPort = {
      completeChannelLink,
      emit: vi.fn(),
      listSymptomTrackings: vi.fn(),
      listLfkComplexes: vi.fn(),
    };
    const tgCtx: DomainContext = {
      ...ctx,
      base: {
        ...ctx.base,
        facts: {
          links: {
            webappDiaryUrl: 'https://app.example/diary',
            webappHomeUrl: 'https://app.example/home',
          },
        },
      },
      event: {
        type: 'message.received',
        meta: {
          eventId: 'evt-cl-tg-phone-fail',
          occurredAt: '2026-05-15T12:00:00.000Z',
          source: 'telegram',
          userId: '111',
        },
        payload: {
          incoming: {
            kind: 'message',
            text: '/start link_testtoken',
            chatId: 111,
            channelId: '111',
            action: 'start.link',
            linkSecret: 'link_testtoken',
            userRow: null,
            userState: '',
          },
        },
      },
    };
    const action: Action = {
      id: 'cl-tg-phone-fail',
      type: 'webapp.channelLink.complete',
      mode: 'sync',
      params: { linkToken: 'link_testtoken', channelCode: 'telegram', externalId: '111' },
    };
    const renderTemplate = vi.fn().mockResolvedValue({
      text: 'Не удалось завершить привязку (generic).',
    });
    const result = await executeAction(action, tgCtx, {
      webappEventsPort,
      writePort: { writeDb },
      templatePort: { renderTemplate },
    });
    expect(result.status).toBe('failed');
    expect(writeDb).toHaveBeenCalledTimes(1);
    expect(writeDb).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'user.phone.link', params: expect.objectContaining({ resource: 'telegram' }) }),
    );
    const welcomeSend = result.intents?.find(
      (i) => i.type === 'message.send' && i.meta?.eventId?.includes('after-phone-linked'),
    );
    expect(welcomeSend).toBeUndefined();
    expect(renderTemplate).toHaveBeenCalledWith(
      expect.objectContaining({
        templateId: 'channelLink.completeFailed.generic',
      }),
    );
    const failureSend = result.intents?.find(
      (i) => i.type === 'message.send' && i.meta?.eventId?.includes('channel-link-phone-sync-failed'),
    );
    expect(failureSend).toBeDefined();
    expect(
      (result.values as { channelLink?: { ok?: boolean; webappComplete?: boolean } })?.channelLink?.ok,
    ).toBe(false);
    expect(
      (result.values as { channelLink?: { webappComplete?: boolean } })?.channelLink?.webappComplete,
    ).toBe(true);
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

  describe('reminders.dispatchDue', () => {
    beforeEach(() => {
      enqueueReminderOutboxMock.mockClear();
    });

    const baseRule = {
      id: 'rule-1',
      userId: 'user-1',
      category: 'exercise' as const,
      isEnabled: true,
      scheduleType: 'daily',
      timezone: 'Europe/Moscow',
      intervalMinutes: 1440,
      windowStartMinute: 0,
      windowEndMinute: 1440,
      daysMask: '127',
      contentMode: 'none' as const,
      reminderIntent: 'warmup' as const,
    };
    const dueOcc = {
      id: 'occ-1',
      ruleId: 'rule-1',
      userId: 'user-1',
      category: 'exercise' as const,
      timezone: 'Europe/Moscow',
      channelId: 'telegram',
      chatId: 42,
      occurrenceKey: 'k1',
      plannedAt: '2026-03-05T10:00:00.000Z',
      status: 'planned' as const,
    };

    it('calls deliveryTargetsPort with topic and drops telegram when bindings omit telegramId', async () => {
      const readDb = vi.fn().mockImplementation(async (q: { type: string }) => {
        if (q.type === 'reminders.occurrences.due') return [dueOcc];
        if (q.type === 'reminders.rules.forUser') return [baseRule];
        if (q.type === 'identities.allByUserId') {
          return [{ resource: 'max', externalId: 'max-ext-1', chatId: 7 }];
        }
        return null;
      });
      const writeDb = vi.fn().mockResolvedValue(undefined);
      const getTargetsByChannelBinding = vi.fn().mockResolvedValue({ maxId: 'max-ext-1' });
      const deliveryTargetsPort = {
        getTargetsByPhone: vi.fn(),
        getTargetsByChannelBinding,
      };
      const action: Action = {
        id: 'rd1',
        type: 'reminders.dispatchDue',
        mode: 'async',
        params: { nowIso: '2026-03-05T12:00:00.000Z', limit: 10 },
      };
      const result = await executeAction(action, ctx, {
        readPort: { readDb },
        writePort: { writeDb },
        deliveryTargetsPort,
      });
      expect(result.status).toBe('success');
      expect(getTargetsByChannelBinding).toHaveBeenCalledWith({
        telegramId: '42',
        maxId: 'max-ext-1',
        topic: 'exercise_reminders',
      });
      const sends = result.intents?.filter((i) => i.type === 'message.send') ?? [];
      expect(sends).toHaveLength(0);
      expect(enqueueReminderOutboxMock).toHaveBeenCalled();
      const firstCall = enqueueReminderOutboxMock.mock.calls[0]?.[1] as { channel?: string } | undefined;
      expect(firstCall?.channel).toBe('max');
    });

    it('does not drop all channels when topic bindings resolve to an empty object', async () => {
      const readDb = vi.fn().mockImplementation(async (q: { type: string }) => {
        if (q.type === 'reminders.occurrences.due') return [dueOcc];
        if (q.type === 'reminders.rules.forUser') return [baseRule];
        if (q.type === 'identities.allByUserId') {
          return [{ resource: 'max', externalId: 'max-ext-1', chatId: 7 }];
        }
        return null;
      });
      const writeDb = vi.fn().mockResolvedValue(undefined);
      const getTargetsByChannelBinding = vi.fn().mockResolvedValue({});
      const deliveryTargetsPort = {
        getTargetsByPhone: vi.fn(),
        getTargetsByChannelBinding,
      };
      const action: Action = {
        id: 'rd2',
        type: 'reminders.dispatchDue',
        mode: 'async',
        params: { nowIso: '2026-03-05T12:00:00.000Z', limit: 10 },
      };
      const result = await executeAction(action, ctx, {
        readPort: { readDb },
        writePort: { writeDb },
        deliveryTargetsPort,
      });
      expect(result.status).toBe('success');
      expect(getTargetsByChannelBinding).toHaveBeenCalled();
      expect(enqueueReminderOutboxMock).toHaveBeenCalledTimes(2);
      const channels = enqueueReminderOutboxMock.mock.calls.map(
        (c) => (c[1] as { channel?: string } | undefined)?.channel,
      );
      expect(channels.sort()).toEqual(['max', 'telegram']);
    });
  });

  describe('reminders.snooze.callback (telegram)', () => {
    const snoozeCtx: DomainContext = {
      ...ctx,
      event: {
        type: 'callback.received',
        meta: { eventId: 'evt-snooze', occurredAt: '2026-03-05T12:00:00.000Z', source: 'telegram' },
        payload: {
          incoming: {
            kind: 'callback',
            chatId: 100,
            messageId: 55,
            channelUserId: 777,
            callbackQueryId: 'cb-snooze-1',
            action: 'rem_snooze',
          },
        },
      },
    };

    it('emits callback.answer before message.edit', async () => {
      const readDb = vi.fn().mockImplementation(async (q: { type: string }) => {
        if (q.type === 'user.byIdentity') return { userId: 'int-user-snooze' };
        if (q.type === 'reminders.occurrence.ownerUserId') return 'int-user-snooze';
        return null;
      });
      const writeDb = vi.fn().mockResolvedValue(undefined);
      const action: Action = {
        id: 'snooze-1',
        type: 'reminders.snooze.callback',
        mode: 'sync',
        params: {
          occurrenceId: 'occ-snooze-1',
          minutes: 15,
          channelUserId: '777',
          resource: 'telegram',
          chatId: 100,
          messageId: 55,
          callbackQueryId: 'cb-snooze-1',
        },
      };
      const result = await executeAction(action, snoozeCtx, {
        readPort: { readDb },
        writePort: { writeDb },
      });
      expect(result.status).toBe('success');
      expect(result.intents?.map((i) => i.type)).toEqual(['callback.answer', 'message.edit']);
      expect((result.intents?.[0]?.payload as { callbackQueryId?: string }).callbackQueryId).toBe('cb-snooze-1');
    });
  });

  describe('reminders.skip.applyPreset (telegram)', () => {
    it('reason none: marks skipped; ack intents are callback.answer then message.edit when messageId set', async () => {
      const readDb = vi.fn().mockImplementation(async (q: { type: string; params?: Record<string, unknown> }) => {
        if (q.type === 'user.byIdentity') {
          expect(q.params).toMatchObject({ resource: 'telegram', externalId: '777' });
          return { userId: 'int-user-1' };
        }
        if (q.type === 'reminders.occurrence.ownerUserId') {
          expect(q.params).toMatchObject({ occurrenceId: 'occ-skip-none' });
          return 'int-user-1';
        }
        return null;
      });
      const writeDb = vi.fn().mockResolvedValue(undefined);
      const renderTemplate = vi.fn().mockResolvedValue({ text: 'skip saved ack' });
      const action: Action = {
        id: 'skip-preset-1',
        type: 'reminders.skip.applyPreset',
        mode: 'sync',
        params: {
          occurrenceId: 'occ-skip-none',
          reasonCode: 'none',
          channelUserId: '777',
          resource: 'telegram',
          chatId: 100,
          messageId: 9001,
          callbackQueryId: 'cb-skip-1',
        },
      };
      const result = await executeAction(action, ctx, {
        readPort: { readDb },
        writePort: { writeDb },
        templatePort: { renderTemplate },
      });
      expect(result.status).toBe('success');
      expect(writeDb).toHaveBeenCalled();
      const markSkipped = writeDb.mock.calls.find((c) => c[0]?.type === 'reminders.occurrence.markSkippedLocal');
      expect(markSkipped?.[0]?.params).toEqual({ occurrenceId: 'occ-skip-none' });
      expect(renderTemplate).toHaveBeenCalledWith(
        expect.objectContaining({
          source: 'telegram',
          templateId: 'reminder.skip.saved',
        }),
      );
      const types = result.intents?.map((i) => i.type) ?? [];
      expect(types).toEqual(['callback.answer', 'message.edit']);
      const edit = result.intents?.find((i) => i.type === 'message.edit');
      expect(edit && 'payload' in edit ? (edit.payload as { messageId?: unknown }).messageId : null).toBe(9001);
    });

    it('reason none: without messageId uses message.send + callback.answer', async () => {
      const readDb = vi.fn().mockImplementation(async (q: { type: string; params?: Record<string, unknown> }) => {
        if (q.type === 'user.byIdentity') return { userId: 'int-user-2' };
        if (q.type === 'reminders.occurrence.ownerUserId') {
          expect(q.params).toMatchObject({ occurrenceId: 'occ-skip-send' });
          return 'int-user-2';
        }
        return null;
      });
      const writeDb = vi.fn().mockResolvedValue(undefined);
      const renderTemplate = vi.fn().mockResolvedValue({ text: 'ack no mid' });
      const action: Action = {
        id: 'skip-preset-2',
        type: 'reminders.skip.applyPreset',
        mode: 'sync',
        params: {
          occurrenceId: 'occ-skip-send',
          reasonCode: 'none',
          channelUserId: '888',
          resource: 'telegram',
          chatId: 101,
          callbackQueryId: 'cb-skip-2',
        },
      };
      const result = await executeAction(action, ctx, {
        readPort: { readDb },
        writePort: { writeDb },
        templatePort: { renderTemplate },
      });
      expect(result.status).toBe('success');
      const types = result.intents?.map((i) => i.type) ?? [];
      expect(types).toEqual(['callback.answer', 'message.send']);
      expect(types).not.toContain('message.edit');
      const send = result.intents?.find((i) => i.type === 'message.send');
      expect(send && 'payload' in send ? (send.payload as { message?: { text?: string } }).message?.text : null).toBe(
        'ack no mid',
      );
    });

    it('reason none: postOccurrenceSkip with reason null runs before markSkippedLocal when webapp port set', async () => {
      const readDb = vi.fn().mockImplementation(async (q: { type: string; params?: Record<string, unknown> }) => {
        if (q.type === 'user.byIdentity') return { userId: 'int-user-webapp-skip' };
        if (q.type === 'reminders.occurrence.ownerUserId') {
          expect(q.params).toMatchObject({ occurrenceId: 'occ-skip-webapp' });
          return 'int-user-webapp-skip';
        }
        return null;
      });
      const writeDb = vi.fn().mockResolvedValue(undefined);
      const renderTemplate = vi.fn().mockResolvedValue({ text: 'skip webapp ack' });
      const postOccurrenceSkip = vi.fn().mockResolvedValue({
        ok: true,
        skippedAt: '2026-01-01T00:00:00.000Z',
      });
      const remindersWebappWritesPort: RemindersWebappWritesPort = {
        postOccurrenceSnooze: vi.fn(),
        postOccurrenceSkip,
        postOccurrenceDone: vi.fn(),
        postReminderMuteUntil: vi.fn(),
      };
      const action: Action = {
        id: 'skip-preset-webapp',
        type: 'reminders.skip.applyPreset',
        mode: 'sync',
        params: {
          occurrenceId: 'occ-skip-webapp',
          reasonCode: 'none',
          channelUserId: '999',
          resource: 'telegram',
          chatId: 102,
          messageId: 9002,
          callbackQueryId: 'cb-skip-w',
        },
      };
      const result = await executeAction(action, ctx, {
        readPort: { readDb },
        writePort: { writeDb },
        templatePort: { renderTemplate },
        remindersWebappWritesPort,
      });
      expect(result.status).toBe('success');
      expect(postOccurrenceSkip).toHaveBeenCalledWith({
        integratorUserId: 'int-user-webapp-skip',
        occurrenceId: 'occ-skip-webapp',
        reason: null,
      });
      const markIdx = writeDb.mock.calls.findIndex((c) => c[0]?.type === 'reminders.occurrence.markSkippedLocal');
      expect(markIdx).toBeGreaterThanOrEqual(0);
      expect(postOccurrenceSkip.mock.invocationCallOrder[0]).toBeLessThan(
        writeDb.mock.invocationCallOrder[markIdx]!,
      );
    });
  });

  describe('reminders.skip.applyFreeText (max)', () => {
    it('uses message.edit on reply target when replyToMessageId is present', async () => {
      const readDb = vi.fn().mockImplementation(async (q: { type: string; params?: { occurrenceId?: string } }) => {
        if (q.type === 'user.byIdentity') return { userId: 'user-1' };
        if (q.type === 'reminders.occurrence.ownerUserId' && q.params?.occurrenceId === 'occ-ft') {
          return 'user-1';
        }
        return null;
      });
      const writeDb = vi.fn().mockResolvedValue(undefined);
      const maxCtx: DomainContext = {
        ...ctx,
        event: {
          ...ctx.event,
          meta: { ...ctx.event.meta, source: 'max' },
          payload: {
            incoming: {
              kind: 'message',
              text: 'причина пропуска',
              chatId: 200,
              channelId: '200',
              replyToMessageId: 'prompt-mid-1',
            },
          },
        },
        base: { ...ctx.base, conversationState: 'waiting_skip_reason:occ-ft' },
      };
      const action: Action = {
        id: 'aft-max-1',
        type: 'reminders.skip.applyFreeText',
        mode: 'sync',
        params: { channelUserId: '200', resource: 'max', chatId: 200 },
      };
      const result = await executeAction(action, maxCtx, {
        readPort: { readDb },
        writePort: { writeDb },
        templatePort: {
          renderTemplate: vi.fn().mockResolvedValue({ text: 'saved ack' }),
        },
      });
      expect(result.status).toBe('success');
      const intent = result.intents?.[0];
      expect(intent?.type).toBe('message.edit');
      const pl = intent && 'payload' in intent ? (intent.payload as Record<string, unknown>) : null;
      expect(pl?.messageId).toBe('prompt-mid-1');
      expect(pl?.delivery).toEqual(expect.objectContaining({ channels: ['max'] }));
    });
  });

  describe('question.markAllUnansweredAnswered', () => {
    it('marks each unanswered row with question.markAnswered', async () => {
      const readDb = vi.fn()
        .mockResolvedValueOnce([
          { id: 'q1', conversation_id: 'c1', text: 'hi', user_channel_id: '1', first_name: 'A' },
          { id: 'q2', conversation_id: 'c2', text: 'yo', user_channel_id: '2', first_name: 'B' },
        ]);
      const writeDb = vi.fn().mockResolvedValue(undefined);
      const adminCtx: DomainContext = {
        ...ctx,
        event: {
          type: 'callback.received',
          meta: { ...ctx.event.meta, source: 'telegram' },
          payload: {
            incoming: {
              kind: 'callback',
              chatId: 999,
              channelId: '999',
              action: 'questions.mark_all_answered',
            },
          },
        },
        base: { ...ctx.base, actor: { isAdmin: true } },
      };
      const action: Action = {
        id: 'mark-all-1',
        type: 'question.markAllUnansweredAnswered',
        mode: 'sync',
        params: { limit: 20 },
      };
      const result = await executeAction(action, adminCtx, {
        readPort: { readDb },
        writePort: { writeDb },
      });
      expect(result.status).toBe('success');
      expect(result.values?.markedCount).toBe(2);
      expect(writeDb).toHaveBeenCalledTimes(2);
      const markCalls = writeDb.mock.calls.filter(
        (c) => c[0] && typeof c[0] === 'object' && (c[0] as { type?: string }).type === 'question.markAnswered',
      );
      expect(markCalls).toHaveLength(2);
      expect((markCalls[0]?.[0] as { params?: { questionId?: string } }).params?.questionId).toBe('q1');
      expect((markCalls[1]?.[0] as { params?: { questionId?: string } }).params?.questionId).toBe('q2');
    });

    it('returns zero markedCount when list empty', async () => {
      const readDb = vi.fn().mockResolvedValueOnce([]);
      const writeDb = vi.fn().mockResolvedValue(undefined);
      const adminCtx: DomainContext = {
        ...ctx,
        event: {
          type: 'callback.received',
          meta: { ...ctx.event.meta, source: 'telegram' },
          payload: {
            incoming: {
              kind: 'callback',
              chatId: 999,
              channelId: '999',
              action: 'questions.mark_all_answered',
            },
          },
        },
        base: { ...ctx.base, actor: { isAdmin: true } },
      };
      const action: Action = {
        id: 'mark-all-0',
        type: 'question.markAllUnansweredAnswered',
        mode: 'sync',
        params: { limit: 20 },
      };
      const result = await executeAction(action, adminCtx, {
        readPort: { readDb },
        writePort: { writeDb },
      });
      expect(result.status).toBe('success');
      expect(result.values?.markedCount).toBe(0);
      expect(writeDb).not.toHaveBeenCalled();
    });
  });
});

describe('resolveTargets guardrail: webapp-backed resolution', () => {
  it('uses deliveryTargetsPort and does NOT call readPort for user.lookup', async () => {
    const readDb = vi.fn();
    const readPort = { readDb } as unknown as DbReadPort;
    const getTargetsByPhone = vi.fn().mockResolvedValue({ telegramId: '555', maxId: 'max-1' });
    const deliveryTargetsPort = { getTargetsByPhone, getTargetsByChannelBinding: vi.fn() };

    const targets = await resolveTargets(
      { recipient: { phoneNormalized: '+79991234567' }, delivery: { channels: ['telegram'] } },
      { readPort, deliveryTargetsPort },
    );

    expect(targets).toEqual([{ resource: 'telegram', address: { chatId: 555 } }]);
    expect(getTargetsByPhone).toHaveBeenCalledWith('+79991234567');
    expect(readDb).not.toHaveBeenCalled();
  });

  it('falls back to phoneNormalized address when deliveryTargetsPort returns null bindings', async () => {
    const readDb = vi.fn();
    const readPort = { readDb } as unknown as DbReadPort;
    const getTargetsByPhone = vi.fn().mockResolvedValue(null);
    const deliveryTargetsPort = { getTargetsByPhone, getTargetsByChannelBinding: vi.fn() };

    const targets = await resolveTargets(
      { recipient: { phoneNormalized: '+79991234567' }, delivery: { channels: ['telegram'] } },
      { readPort, deliveryTargetsPort },
    );

    expect(targets).toEqual([{ resource: 'telegram', address: { phoneNormalized: '+79991234567' } }]);
    expect(readDb).not.toHaveBeenCalled();
  });
});
