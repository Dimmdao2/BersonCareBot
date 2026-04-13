import { describe, expect, it, vi } from 'vitest';
import type { BaseContext, ContentPort, ContextQueryPort, IncomingEvent } from '../contracts/index.js';
import { buildPlan } from './resolver.js';

describe('orchestrator buildPlan', () => {
  it('gates reply-keyboard menu action booking.open when linkedPhone is not true (before script resolver)', async () => {
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
          text: '📅 Запись на приём',
          chatId: 123,
          channelUserId: 123,
        },
      },
    };

    const baseContext: BaseContext = {
      actor: { isAdmin: false },
      identityLinks: [],
      linkedPhone: false,
    };

    const getScriptsBySource = vi.fn().mockResolvedValue([
      {
        id: 'telegram.booking.open.fallback',
        source: 'telegram',
        event: 'message.received',
        match: { input: { action: 'booking.open' } },
        steps: [{ action: 'noop', mode: 'sync', params: {} }],
      },
    ]);
    const contentPort: ContentPort = {
      getScriptsBySource,
      getTemplate: vi.fn().mockResolvedValue(null),
    };

    const contextQueryPort: ContextQueryPort = {
      request: vi.fn().mockResolvedValue({}),
    };

    const plan = await buildPlan({ event, context: baseContext }, { contentPort, contextQueryPort });

    expect(getScriptsBySource).not.toHaveBeenCalled();
    expect(plan).toHaveLength(2);
    expect(plan[0]).toMatchObject({
      kind: 'user.state.set',
      payload: { state: 'await_contact:subscription' },
    });
    expect(plan[1]).toMatchObject({
      kind: 'message.replyKeyboard.show',
      payload: { templateKey: 'telegram:confirmPhoneForBooking' },
    });
  });

  it('gates reply-keyboard menu by message text when action is empty (same as booking.open)', async () => {
    const event: IncomingEvent = {
      type: 'message.received',
      meta: {
        eventId: 'evt-bookingopen-text-only-1',
        occurredAt: '2026-03-05T12:00:00.000Z',
        source: 'telegram',
      },
      payload: {
        incoming: {
          text: '📅 Запись на приём',
          chatId: 123,
          channelUserId: 123,
        },
      },
    };

    const baseContext: BaseContext = {
      actor: { isAdmin: false },
      identityLinks: [],
      linkedPhone: false,
    };

    const getScriptsBySource = vi.fn().mockResolvedValue([
      {
        id: 'telegram.booking.open.fallback',
        source: 'telegram',
        event: 'message.received',
        match: { input: { action: 'booking.open' } },
        steps: [{ action: 'noop', mode: 'sync', params: {} }],
      },
    ]);
    const contentPort: ContentPort = {
      getScriptsBySource,
      getTemplate: vi.fn().mockResolvedValue(null),
    };

    const contextQueryPort: ContextQueryPort = {
      request: vi.fn().mockResolvedValue({}),
    };

    const plan = await buildPlan({ event, context: baseContext }, { contentPort, contextQueryPort });

    expect(getScriptsBySource).not.toHaveBeenCalled();
    expect(plan).toHaveLength(2);
    expect(plan[0]).toMatchObject({
      kind: 'user.state.set',
      payload: { state: 'await_contact:subscription' },
    });
    expect(plan[1]).toMatchObject({
      kind: 'message.replyKeyboard.show',
      payload: { templateKey: 'telegram:confirmPhoneForBooking' },
    });
  });

  it('allows booking.open to resolve from scripts when linkedPhone is true', async () => {
    const event: IncomingEvent = {
      type: 'message.received',
      meta: {
        eventId: 'evt-bookingopen-linked-1',
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
      linkedPhone: true,
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
          steps: [{ action: 'message.send', mode: 'async', params: { templateKey: 'telegram:bookingMessage' } }],
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
      kind: 'message.send',
      payload: { templateKey: 'telegram:bookingMessage' },
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

  it('for telegram callback without linked phone, central gate returns request-contact plan (no script load)', async () => {
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
      ]),
      getTemplate: vi.fn().mockResolvedValue(null),
    };

    const contextQueryPort: ContextQueryPort = {
      request: vi.fn().mockResolvedValue({}),
    };

    const plan = await buildPlan({ event, context: baseContext }, { contentPort, contextQueryPort });

    expect(contentPort.getScriptsBySource).not.toHaveBeenCalled();
    expect(plan).toHaveLength(3);
    expect(plan[0]?.kind).toBe('user.state.set');
    expect(plan[1]?.kind).toBe('message.replyKeyboard.show');
    expect(plan[2]).toMatchObject({
      kind: 'callback.answer',
      payload: { callbackQueryId: 'cb-1' },
    });
  });

  it('for callback with linked phone, resolves business scripts as before', async () => {
    const event: IncomingEvent = {
      type: 'callback.received',
      meta: {
        eventId: 'evt-bookings-linked-1',
        occurredAt: '2026-03-05T12:00:00.000Z',
        source: 'telegram',
      },
      payload: {
        incoming: {
          action: 'bookings.show',
          chatId: 123,
          channelUserId: 123,
          callbackQueryId: 'cb-2',
        },
      },
    };

    const baseContext: BaseContext = {
      actor: { isAdmin: false },
      identityLinks: [],
      linkedPhone: true,
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
      ]),
      getTemplate: vi.fn().mockResolvedValue(null),
    };

    const contextQueryPort: ContextQueryPort = {
      request: vi.fn().mockResolvedValue({}),
    };

    const plan = await buildPlan({ event, context: baseContext }, { contentPort, contextQueryPort });

    expect(contentPort.getScriptsBySource).toHaveBeenCalledWith('telegram');
    expect(plan).toHaveLength(1);
    expect(plan[0]?.payload).toMatchObject({ text: 'show bookings' });
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
      linkedPhone: true,
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
      linkedPhone: true,
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
          match: { input: { action: 'menu.more' }, context: { linkedPhone: true } },
          steps: [{ action: 'message.send', mode: 'async', params: { templateKey: 'telegram:menu.webapp.prompt' } }],
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
      kind: 'message.send',
      payload: { templateKey: 'telegram:menu.webapp.prompt' },
    });
  });

  it('excludeTextPrefixes: any text starting with /start does not match question script', async () => {
    const event: IncomingEvent = {
      type: 'message.received',
      meta: { eventId: 'evt-start-prefix', occurredAt: '2026-03-05T12:00:00.000Z', source: 'telegram' },
      payload: {
        incoming: {
          action: 'unknown_future_command',
          text: '/start future_thing_123',
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
            context: { hasOpenConversation: false },
            input: {
              textPresent: true,
              excludeTexts: ['/start'],
              excludeTextPrefixes: ['/start'],
            },
          },
          steps: [{ action: 'draft.send', mode: 'sync', params: {} }],
        },
      ]),
      getTemplate: vi.fn().mockResolvedValue(null),
    };

    const contextQueryPort: ContextQueryPort = { request: vi.fn().mockResolvedValue({}) };

    const plan = await buildPlan({ event, context: baseContext }, { contentPort, contextQueryPort });

    expect(plan).toHaveLength(0);
  });

  it('selects deep-link start handler when start.setrubitimerecord is excluded from default send', async () => {
    const event: IncomingEvent = {
      type: 'message.received',
      meta: {
        eventId: 'evt-start-rubitime',
        occurredAt: '2026-03-05T12:00:00.000Z',
        source: 'telegram',
      },
      payload: {
        incoming: {
          action: 'start.setrubitimerecord',
          text: '/start setrubitimerecord_7967313',
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
              excludeActions: ['booking.open', 'menu.more', 'cabinet.open', 'diary.open', 'start.setrubitimerecord'],
              excludeTexts: ['/start'],
            },
          },
          steps: [{ action: 'message.send', mode: 'async', params: { templateKey: 'telegram:questionAccepted' } }],
        },
        {
          id: 'telegram.start.setrubitimerecord',
          source: 'telegram',
          event: 'message.received',
          match: { input: { action: 'start.setrubitimerecord' } },
          steps: [{ action: 'message.inlineKeyboard.show', mode: 'async', params: { templateKey: 'telegram:bookingsList' } }],
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
      payload: { templateKey: 'telegram:bookingsList' },
    });
  });

  it('selects telegram.start.onboarding for /start when linkedPhone is false', async () => {
    const event: IncomingEvent = {
      type: 'message.received',
      meta: {
        eventId: 'evt-start-onb-1',
        occurredAt: '2026-04-04T12:00:00.000Z',
        source: 'telegram',
      },
      payload: {
        incoming: {
          text: '/start',
          chatId: 555,
          channelUserId: 555,
        },
      },
    };

    const baseContext: BaseContext = {
      actor: { isAdmin: false },
      identityLinks: [],
      linkedPhone: false,
    };

    const contentPort: ContentPort = {
      getScriptsBySource: vi.fn().mockResolvedValue([
        {
          id: 'telegram.start.onboarding',
          source: 'telegram',
          event: 'message.received',
          priority: 15,
          match: {
            input: { text: '/start' },
            context: { linkedPhone: false },
          },
          steps: [
            {
              action: 'user.state.set',
              mode: 'sync',
              params: { state: 'await_contact:subscription' },
            },
            {
              action: 'message.replyKeyboard.show',
              mode: 'async',
              params: {
                templateKey: 'telegram:onboardingWelcome',
              },
            },
          ],
        },
        {
          id: 'telegram.start',
          source: 'telegram',
          event: 'message.received',
          match: {
            input: { text: '/start' },
            context: { linkedPhone: true },
          },
          steps: [{ action: 'noop', mode: 'sync', params: {} }],
        },
      ]),
      getTemplate: vi.fn().mockResolvedValue(null),
    };

    const contextQueryPort: ContextQueryPort = {
      request: vi.fn().mockResolvedValue({}),
    };

    const plan = await buildPlan({ event, context: baseContext }, { contentPort, contextQueryPort });

    expect(plan).toHaveLength(2);
    expect(plan[0]).toMatchObject({
      kind: 'user.state.set',
      payload: { state: 'await_contact:subscription' },
    });
    expect(plan[1]).toMatchObject({
      kind: 'message.replyKeyboard.show',
      payload: { templateKey: 'telegram:onboardingWelcome' },
    });
  });

  it('selects telegram.start.onboarding for /start with deep-link payload when linkedPhone is false', async () => {
    const event: IncomingEvent = {
      type: 'message.received',
      meta: {
        eventId: 'evt-start-onb-deeplink-1',
        occurredAt: '2026-04-08T12:00:00.000Z',
        source: 'telegram',
      },
      payload: {
        incoming: {
          text: '/start channel_promo_1',
          action: '',
          chatId: 555,
          channelUserId: 555,
        },
      },
    };

    const baseContext: BaseContext = {
      actor: { isAdmin: false },
      identityLinks: [],
      linkedPhone: false,
    };

    const contentPort: ContentPort = {
      getScriptsBySource: vi.fn().mockResolvedValue([
        {
          id: 'telegram.start.onboarding',
          source: 'telegram',
          event: 'message.received',
          priority: 15,
          match: {
            input: {
              text: { $startsWith: '/start' },
              excludeActions: ['start.link', 'start.noticeme', 'start.setrubitimerecord', 'start.setphone', 'start.set'],
            },
            context: { linkedPhone: false },
          },
          steps: [
            {
              action: 'user.state.set',
              mode: 'sync',
              params: { state: 'await_contact:subscription' },
            },
            {
              action: 'message.replyKeyboard.show',
              mode: 'async',
              params: {
                templateKey: 'telegram:onboardingWelcome',
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

    expect(plan).toHaveLength(2);
    expect(plan[0]).toMatchObject({
      kind: 'user.state.set',
      payload: { state: 'await_contact:subscription' },
    });
  });

  /** Регресс цепочки onboarding → шаринг контакта: п.4 плана bot contact onboarding. */
  it('selects telegram.contact.link.confirm when contact shared in await_contact subscription', async () => {
    const event: IncomingEvent = {
      type: 'message.received',
      meta: {
        eventId: 'evt-contact-confirm-1',
        occurredAt: '2026-04-08T12:00:00.000Z',
        source: 'telegram',
      },
      payload: {
        incoming: {
          chatId: 557,
          channelUserId: 557,
          phone: '+79990001122',
        },
      },
    };

    const baseContext: BaseContext = {
      actor: { isAdmin: false },
      identityLinks: [],
      linkedPhone: false,
      conversationState: 'await_contact:subscription',
    };

    const contentPort: ContentPort = {
      getScriptsBySource: vi.fn().mockResolvedValue([
        {
          id: 'telegram.contact.link.confirm',
          source: 'telegram',
          event: 'message.received',
          match: {
            context: { conversationState: 'await_contact:subscription' },
            input: { phonePresent: true },
          },
          steps: [
            {
              action: 'user.phone.link',
              mode: 'sync',
              params: {
                channelUserId: '{{actor.channelUserId}}',
                phoneNormalized: '{{input.phone}}',
              },
            },
            {
              action: 'user.state.set',
              mode: 'sync',
              params: {
                channelUserId: '{{actor.channelUserId}}',
                state: 'idle',
              },
            },
            {
              action: 'message.replyKeyboard.show',
              mode: 'async',
              params: { templateKey: 'telegram:chooseMenu' },
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

    expect(plan).toHaveLength(3);
    expect(plan[0]).toMatchObject({
      kind: 'user.phone.link',
      payload: { phoneNormalized: '+79990001122' },
    });
    expect(plan[1]).toMatchObject({
      kind: 'user.state.set',
      payload: { state: 'idle' },
    });
    expect(plan[2]).toMatchObject({
      kind: 'message.replyKeyboard.show',
      payload: { templateKey: 'telegram:chooseMenu' },
    });
  });

  it('selects telegram.start for /start when linkedPhone is true', async () => {
    const event: IncomingEvent = {
      type: 'message.received',
      meta: {
        eventId: 'evt-start-linked-1',
        occurredAt: '2026-04-04T12:00:00.000Z',
        source: 'telegram',
      },
      payload: {
        incoming: {
          text: '/start',
          chatId: 556,
          channelUserId: 556,
        },
      },
    };

    const baseContext: BaseContext = {
      actor: { isAdmin: false },
      identityLinks: [{ kind: 'phone', value: '+79990001122' }],
      linkedPhone: true,
      phoneNormalized: '+79990001122',
    };

    const contentPort: ContentPort = {
      getScriptsBySource: vi.fn().mockResolvedValue([
        {
          id: 'telegram.start.onboarding',
          source: 'telegram',
          event: 'message.received',
          priority: 15,
          match: {
            input: { text: '/start' },
            context: { linkedPhone: false },
          },
          steps: [{ action: 'noop', mode: 'sync', params: {} }],
        },
        {
          id: 'telegram.start',
          source: 'telegram',
          event: 'message.received',
          match: {
            input: { text: '/start' },
            context: { linkedPhone: true },
          },
          steps: [
            {
              action: 'user.state.set',
              mode: 'sync',
              params: { state: 'idle' },
            },
            {
              action: 'message.replyKeyboard.show',
              mode: 'async',
              params: { templateKey: 'telegram:chooseMenu' },
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

    expect(plan).toHaveLength(2);
    expect(plan[0]).toMatchObject({
      kind: 'user.state.set',
      payload: { state: 'idle' },
    });
    expect(plan[1]).toMatchObject({
      kind: 'message.replyKeyboard.show',
      payload: { templateKey: 'telegram:chooseMenu' },
    });
  });

  it('selects max.start.onboarding for /start on max when linkedPhone is false', async () => {
    const event: IncomingEvent = {
      type: 'message.received',
      meta: {
        eventId: 'evt-max-start-onb-1',
        occurredAt: '2026-04-04T12:00:00.000Z',
        source: 'max',
      },
      payload: {
        incoming: {
          text: '/start',
          chatId: 9001,
          channelUserId: 'max-user-1',
        },
      },
    };

    const baseContext: BaseContext = {
      actor: { isAdmin: false },
      identityLinks: [],
      linkedPhone: false,
    };

    const contentPort: ContentPort = {
      getScriptsBySource: vi.fn().mockResolvedValue([
        {
          id: 'max.start.onboarding',
          source: 'max',
          event: 'message.received',
          priority: 15,
          match: {
            input: { text: '/start' },
            context: { linkedPhone: false },
          },
          steps: [
            {
              action: 'user.state.set',
              mode: 'sync',
              params: { channelUserId: '{{actor.channelUserId}}', state: 'await_contact:subscription' },
            },
            {
              action: 'message.send',
              mode: 'async',
              params: {
                templateKey: 'max:onboardingWelcome',
                inlineKeyboard: [[{ textTemplateKey: 'max:requestContact.button', requestPhone: true }]],
              },
            },
          ],
        },
        {
          id: 'max.start',
          source: 'max',
          event: 'message.received',
          match: {
            input: { text: '/start' },
            context: { linkedPhone: true },
          },
          steps: [{ action: 'noop', mode: 'sync', params: {} }],
        },
      ]),
      getTemplate: vi.fn().mockResolvedValue(null),
    };

    const contextQueryPort: ContextQueryPort = {
      request: vi.fn().mockResolvedValue({}),
    };

    const plan = await buildPlan({ event, context: baseContext }, { contentPort, contextQueryPort });

    expect(plan).toHaveLength(2);
    expect(plan[0]).toMatchObject({
      kind: 'user.state.set',
      payload: { state: 'await_contact:subscription' },
    });
    expect(plan[1]).toMatchObject({
      kind: 'message.send',
      payload: { templateKey: 'max:onboardingWelcome' },
    });
  });

  it('admin start.link selects webapp.channelLink.complete over catch-all admin test script', async () => {
    const event: IncomingEvent = {
      type: 'message.received',
      meta: {
        eventId: 'evt-admin-start-link-1',
        occurredAt: '2026-04-11T12:00:00.000Z',
        source: 'telegram',
      },
      payload: {
        incoming: {
          action: 'start.link',
          linkSecret: 'link_tok_1',
          channelId: 'tg-ext-1',
          text: '/start link_tok_1',
          chatId: 42,
          channelUserId: 42,
        },
      },
    };

    const baseContext: BaseContext = {
      actor: { isAdmin: true },
      identityLinks: [],
    };

    const contentPort: ContentPort = {
      getScriptsBySource: vi.fn().mockResolvedValue([
        {
          id: 'telegram.admin.test.anyCommand',
          source: 'telegram',
          event: 'message.received',
          priority: 1,
          match: {
            actor: { isAdmin: true },
            input: { excludeActions: ['start.link'] },
          },
          steps: [
            {
              action: 'message.send',
              mode: 'async',
              params: { templateKey: 'telegram:admin.test.commandReceived' },
            },
          ],
        },
        {
          id: 'telegram.admin.start.link',
          source: 'telegram',
          event: 'message.received',
          priority: 20,
          match: {
            input: { action: 'start.link' },
            actor: { isAdmin: true },
          },
          steps: [
            {
              action: 'webapp.channelLink.complete',
              mode: 'sync',
              params: {
                linkToken: '{{input.linkSecret}}',
                channelCode: 'telegram',
                externalId: '{{input.channelId}}',
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
    expect(plan[0]).toMatchObject({
      kind: 'webapp.channelLink.complete',
      payload: {
        linkToken: 'link_tok_1',
        channelCode: 'telegram',
        externalId: 'tg-ext-1',
      },
    });
  });
});
