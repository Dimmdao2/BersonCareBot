import { describe, expect, it, vi } from 'vitest';
import type { BaseContext, ContentPort, ContextQueryPort, IncomingEvent } from '../contracts/index.js';
import { buildPlan } from './resolver.js';

describe('orchestrator buildPlan', () => {
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

  it('resolves menu button textTemplateKey values in orchestrator payload', async () => {
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
      getTemplate: vi.fn().mockImplementation(async (key: string) => {
        if (key === 'telegram:chooseMenu') return { id: 'chooseMenu', text: 'Выберите действие' };
        if (key === 'telegram:menu.book') return { id: 'menu.book', text: '📅 Запись на приём' };
        if (key === 'telegram:menu.ask') return { id: 'menu.ask', text: '❓ Задать вопрос' };
        return null;
      }),
    };

    const contextQueryPort: ContextQueryPort = {
      request: vi.fn().mockResolvedValue({}),
    };

    const plan = await buildPlan({ event, context: baseContext }, { contentPort, contextQueryPort });

    expect(plan).toHaveLength(1);
    expect(plan[0]?.payload).toMatchObject({
      text: 'Выберите действие',
      keyboard: [
        [{ text: '📅 Запись на приём' }],
        [{ text: '❓ Задать вопрос' }],
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
});
