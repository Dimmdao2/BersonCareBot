import { describe, expect, it, vi } from 'vitest';
import type { BaseContext, ContentPort, ContextQueryPort, IncomingEvent } from '../contracts/index.js';
import { buildPlan } from './resolver.js';

describe('orchestrator buildPlan', () => {
  it('can fall back to a generic booking.open script when linkedPhone context is absent', async () => {
    const event: IncomingEvent = {
      type: 'message.received',
      meta: {
        eventId: 'evt-bookingopen-fallback-1',
        occurredAt: '2026-03-05T12:00:00.000Z',
        source: 'telegram',
      },
      payload: {
        incoming: {
          action: 'booking.open',
          chatId: 123,
          channelUserId: 123,
        },
      },
    };

    const baseContext: BaseContext = {
      actor: { isAdmin: false },
      identityLinks: [],
    };

    const contentPort: ContentPort = {
      getScriptsBySource: vi.fn().mockResolvedValue([
        {
          id: 'telegram.booking.open',
          source: 'telegram',
          event: 'message.received',
          match: {
            input: { action: 'booking.open' },
            context: { linkedPhone: true },
          },
          steps: [{ action: 'message.inlineKeyboard.show', mode: 'async', params: { text: 'open booking' } }],
        },
        {
          id: 'telegram.booking.open.fallback',
          source: 'telegram',
          event: 'message.received',
          match: {
            input: { action: 'booking.open' },
          },
          steps: [{ action: 'message.replyKeyboard.show', mode: 'async', params: { text: 'fallback' } }],
        },
      ]),
      getTemplate: vi.fn().mockResolvedValue(null),
    };

    const contextQueryPort: ContextQueryPort = {
      request: vi.fn().mockResolvedValue({}),
    };

    const plan = await buildPlan({ event, context: baseContext }, { contentPort, contextQueryPort });

    expect(plan).toHaveLength(1);
    expect(plan[0]).toMatchObject({
      kind: 'message.replyKeyboard.show',
      payload: { text: 'fallback' },
    });
  });
  it('requests extra context and builds plan', async () => {
    const event: IncomingEvent = {
      type: 'webhook.received',
      meta: {
        eventId: 'evt-1',
        occurredAt: '2026-03-05T12:00:00.000Z',
        source: 'source-a',
      },
      payload: {
        body: { data: { id: 'rec-1' } },
      },
    };

    const baseContext: BaseContext = {
      actor: { isAdmin: false },
      identityLinks: [{ kind: 'phone', value: '+79990001122' }],
    };

    const contentPort: ContentPort = {
      getScriptsBySource: vi.fn().mockResolvedValue([
        {
          id: 'event.received',
          source: 'source-a',
          event: 'webhook.received',
          conditions: [
            {
              kind: 'context.query',
              name: 'subscriptions',
              query: { type: 'subscriptions.forUser', userId: '{{context.identityLinks.0.value}}' },
            },
          ],
          steps: [
            {
              action: 'event.log',
              mode: 'sync',
              params: { eventId: '{{event.meta.eventId}}' },
            },
          ],
        },
      ]),
      getTemplate: vi.fn().mockResolvedValue(null),
    };

    const contextQueryPort: ContextQueryPort = {
      request: vi.fn().mockResolvedValue({ type: 'subscriptions.forUser', items: [] }),
    };

    const plan = await buildPlan({ event, context: baseContext }, { contentPort, contextQueryPort });

    expect(contextQueryPort.request).toHaveBeenCalledTimes(1);
    expect(plan.length).toBeGreaterThan(0);
  });

  it('preserves template-based menu payload for downstream runtime rendering', async () => {
    const event: IncomingEvent = {
      type: 'message.received',
      meta: {
        eventId: 'evt-menu-1',
        occurredAt: '2026-03-05T12:00:00.000Z',
        source: 'telegram',
      },
      payload: {
        incoming: {
          chatId: 123,
          channelId: '123',
          text: '/start',
        },
      },
    };

    const baseContext: BaseContext = {
      actor: { isAdmin: false },
      identityLinks: [],
    };

    const contentPort: ContentPort = {
      getScriptsBySource: vi.fn().mockResolvedValue([
        {
          id: 'telegram.start',
          source: 'telegram',
          event: 'message.received',
          match: { input: { text: '/start' } },
          steps: [
            {
              action: 'message.replyKeyboard.show',
              mode: 'async',
              params: {
                chatId: '{{input.chatId}}',
                templateKey: 'telegram:chooseMenu',
                keyboard: [
                  [{ textTemplateKey: 'telegram:menu.book' }],
                  [{ textTemplateKey: 'telegram:menu.ask' }],
                ],
              },
            },
          ],
        },
      ]),
      getTemplate: vi.fn().mockResolvedValue(null),
    };

    const contextQueryPort: ContextQueryPort = {
      request: vi.fn().mockResolvedValue({}),
    };

    const plan = await buildPlan({ event, context: baseContext }, { contentPort, contextQueryPort });

    expect(plan).toHaveLength(1);
    expect(plan[0]?.payload).toMatchObject({
      templateKey: 'telegram:chooseMenu',
      keyboard: [
        [{ textTemplateKey: 'telegram:menu.book' }],
        [{ textTemplateKey: 'telegram:menu.ask' }],
      ],
    });
  });

  it('keeps prefix-based button templates unresolved for downstream runtime handling', async () => {
    const event: IncomingEvent = {
      type: 'callback.received',
      meta: {
        eventId: 'evt-menu-2',
        occurredAt: '2026-03-05T12:00:00.000Z',
        source: 'telegram',
      },
      payload: {
        incoming: {
          action: 'notifications.show',
          chatId: 123,
          messageId: 77,
        },
      },
    };

    const baseContext: BaseContext = {
      actor: { isAdmin: false },
      identityLinks: [],
    };

    const contentPort: ContentPort = {
      getScriptsBySource: vi.fn().mockResolvedValue([
        {
          id: 'telegram.notifications.show',
          source: 'telegram',
          event: 'callback.received',
          match: { input: { action: 'notifications.show' } },
          steps: [
            {
              action: 'message.edit',
              mode: 'async',
              params: {
                chatId: '{{input.chatId}}',
                messageId: '{{input.messageId}}',
                inlineKeyboard: [[{
                  textTemplateKey: 'telegram:notifications.label.spb',
                  prefixTemplateKey: 'telegram:notifications.togglePrefix',
                  callbackData: 'notifications.toggle.spb',
                }]],
              },
            },
          ],
        },
      ]),
      getTemplate: vi.fn().mockResolvedValue({ id: 'notifications.label.spb', text: 'Петербург' }),
    };

    const contextQueryPort: ContextQueryPort = {
      request: vi.fn().mockResolvedValue({}),
    };

    const plan = await buildPlan({ event, context: baseContext }, { contentPort, contextQueryPort });

    expect(plan).toHaveLength(1);
    expect(plan[0]?.payload).toMatchObject({
      inlineKeyboard: [[{
        textTemplateKey: 'telegram:notifications.label.spb',
        prefixTemplateKey: 'telegram:notifications.togglePrefix',
        callbackData: 'notifications.toggle.spb',
      }]],
    });
  });

  it('matches and interpolates generic facts without special-case knowledge', async () => {
    const event: IncomingEvent = {
      type: 'message.received',
      meta: {
        eventId: 'evt-facts-1',
        occurredAt: '2026-03-05T12:00:00.000Z',
        source: 'telegram',
      },
      payload: {
        incoming: {
          chatId: 123,
          channelId: '123',
          text: 'open menu',
        },
      },
    };

    const baseContext: BaseContext = {
      actor: { isAdmin: false },
      identityLinks: [],
      facts: {
        menu: {
          target: 'bookings',
          title: 'Открыть раздел',
        },
      },
    };

    const contentPort: ContentPort = {
      getScriptsBySource: vi.fn().mockResolvedValue([
        {
          id: 'telegram.menu.by-facts',
          source: 'telegram',
          event: 'message.received',
          match: { facts: { menu: { target: 'bookings' } } },
          steps: [
            {
              action: 'event.log',
              mode: 'sync',
              params: {
                target: '{{facts.menu.target}}',
                title: '{{facts.menu.title}}',
              },
            },
          ],
        },
      ]),
      getTemplate: vi.fn().mockResolvedValue(null),
    };

    const contextQueryPort: ContextQueryPort = {
      request: vi.fn().mockResolvedValue({}),
    };

    const plan = await buildPlan({ event, context: baseContext }, { contentPort, contextQueryPort });

    expect(plan).toHaveLength(1);
    expect(plan[0]?.payload).toMatchObject({
      target: 'bookings',
      title: 'Открыть раздел',
    });
  });

  it('can fall back to a generic bookings callback script when linkedPhone context is absent', async () => {
    const event: IncomingEvent = {
      type: 'callback.received',
      meta: {
        eventId: 'evt-bookings-fallback-1',
        occurredAt: '2026-03-05T12:00:00.000Z',
        source: 'telegram',
      },
      payload: {
        incoming: {
          action: 'bookings.show',
          chatId: 123,
          channelUserId: 123,
          callbackQueryId: 'cb-1',
        },
      },
    };

    const baseContext: BaseContext = {
      actor: { isAdmin: false },
      identityLinks: [],
    };

    const contentPort: ContentPort = {
      getScriptsBySource: vi.fn().mockResolvedValue([
        {
          id: 'telegram.bookings.show',
          source: 'telegram',
          event: 'callback.received',
          match: {
            input: { action: 'bookings.show' },
            context: { linkedPhone: true },
          },
          steps: [{ action: 'message.edit', mode: 'async', params: { text: 'show bookings' } }],
        },
        {
          id: 'telegram.contact.link.request.bookings.fallback',
          source: 'telegram',
          event: 'callback.received',
          match: {
            input: { action: 'bookings.show' },
          },
          steps: [{ action: 'callback.answer', mode: 'async', params: { callbackQueryId: '{{input.callbackQueryId}}' } }],
        },
      ]),
      getTemplate: vi.fn().mockResolvedValue(null),
    };

    const contextQueryPort: ContextQueryPort = {
      request: vi.fn().mockResolvedValue({}),
    };

    const plan = await buildPlan({ event, context: baseContext }, { contentPort, contextQueryPort });

    expect(plan).toHaveLength(1);
    expect(plan[0]).toMatchObject({
      kind: 'callback.answer',
      payload: { callbackQueryId: 'cb-1' },
    });
  });

  it('uses declared priority as the first routing tie-breaker', async () => {
    const event: IncomingEvent = {
      type: 'message.received',
      meta: {
        eventId: 'evt-priority-1',
        occurredAt: '2026-03-05T12:00:00.000Z',
        source: 'telegram',
      },
      payload: {
        incoming: {
          action: 'menu.more',
          chatId: 123,
          channelUserId: 123,
        },
      },
    };

    const baseContext: BaseContext = {
      actor: { isAdmin: false },
      identityLinks: [],
    };

    const contentPort: ContentPort = {
      getScriptsBySource: vi.fn().mockResolvedValue([
        {
          id: 'telegram.low.priority',
          source: 'telegram',
          event: 'message.received',
          priority: 1,
          match: { input: { action: 'menu.more' } },
          steps: [{ action: 'event.log', mode: 'sync', params: { selected: 'low' } }],
        },
        {
          id: 'telegram.high.priority',
          source: 'telegram',
          event: 'message.received',
          priority: 10,
          match: { input: { action: 'menu.more' } },
          steps: [{ action: 'event.log', mode: 'sync', params: { selected: 'high' } }],
        },
      ]),
      getTemplate: vi.fn().mockResolvedValue(null),
    };

    const contextQueryPort: ContextQueryPort = {
      request: vi.fn().mockResolvedValue({}),
    };

    const plan = await buildPlan({ event, context: baseContext }, { contentPort, contextQueryPort });

    expect(plan).toHaveLength(1);
    expect(plan[0]).toMatchObject({
      kind: 'event.log',
      payload: { selected: 'high' },
    });
  });

  it('selects menu script when message matches menu/command (excludeActions excludes default send)', async () => {
    const event: IncomingEvent = {
      type: 'message.received',
      meta: {
        eventId: 'evt-menu-cmd',
        occurredAt: '2026-03-05T12:00:00.000Z',
        source: 'telegram',
      },
      payload: {
        incoming: {
          action: 'menu.more',
          text: 'Меню',
          chatId: 123,
          channelUserId: 123,
        },
      },
    };

    const baseContext: BaseContext = {
      actor: { isAdmin: false },
      identityLinks: [],
      hasOpenConversation: false,
    };

    const contentPort: ContentPort = {
      getScriptsBySource: vi.fn().mockResolvedValue([
        {
          id: 'telegram.menu.default',
          source: 'telegram',
          event: 'message.received',
          match: {
            actor: { isAdmin: false },
            context: {
              hasOpenConversation: false,
              conversationState: { $notIn: ['diary.symptom.awaiting_title', 'diary.lfk.awaiting_title'] },
            },
            input: {
              textPresent: true,
              excludeActions: ['booking.open', 'menu.more', 'cabinet.open', 'diary.open'],
              excludeTexts: ['/start', '⚙️ Меню', 'Меню', '📅 Запись на приём', 'Запись на приём', '📓 Дневник', 'Дневник', '👤 Кабинет', 'Кабинет'],
            },
          },
          steps: [{ action: 'message.send', mode: 'async', params: { templateKey: 'telegram:questionAccepted' } }],
        },
        {
          id: 'telegram.more.menu',
          source: 'telegram',
          event: 'message.received',
          match: { input: { action: 'menu.more' } },
          steps: [{ action: 'message.inlineKeyboard.show', mode: 'async', params: { menu: 'main' } }],
        },
      ]),
      getTemplate: vi.fn().mockResolvedValue(null),
    };

    const contextQueryPort: ContextQueryPort = {
      request: vi.fn().mockResolvedValue({}),
    };

    const plan = await buildPlan({ event, context: baseContext }, { contentPort, contextQueryPort });

    expect(plan).toHaveLength(1);
    expect(plan[0]).toMatchObject({
      kind: 'message.inlineKeyboard.show',
      payload: { menu: 'main' },
    });
  });
});
