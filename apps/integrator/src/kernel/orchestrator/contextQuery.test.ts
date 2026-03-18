import { describe, expect, it, vi } from 'vitest';
import type { BaseContext, ContentPort, ContextQueryPort, IncomingEvent } from '../contracts/index.js';
import { buildPlan } from './resolver.js';

describe('orchestrator context queries', () => {
  it('calls ContextQueryPort.request and tolerates response', async () => {
    const event: IncomingEvent = {
      type: 'webhook.received',
      meta: {
        eventId: 'evt-ctx-1',
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

  it('supports generic channel lookup by phone for scenario branching', async () => {
    const event: IncomingEvent = {
      type: 'webhook.received',
      meta: {
        eventId: 'evt-ctx-2',
        occurredAt: '2026-03-05T12:00:00.000Z',
        source: 'source-a',
      },
      payload: {
        incoming: {
          phone: '89643805480',
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
          id: 'event.received.lookup',
          source: 'source-a',
          event: 'webhook.received',
          conditions: [
            {
              kind: 'context.query',
              name: 'telegramRecipient',
              query: {
                type: 'channel.lookupByPhone',
                phoneNormalized: '{{input.phone}}',
                resource: 'telegram',
              },
            },
          ],
          steps: [
            {
              action: 'event.log',
              mode: 'sync',
              params: {
                route: 'telegram',
                chatId: '{{queries.telegramRecipient.item.chatId}}',
                _when: { path: 'queries.telegramRecipient.item.chatId', truthy: true },
              },
            },
            {
              action: 'event.log',
              mode: 'sync',
              params: {
                route: 'smsc',
                _when: { path: 'queries.telegramRecipient.item.chatId', truthy: false },
              },
            },
          ],
        },
      ]),
      getTemplate: vi.fn().mockResolvedValue(null),
    };

    const contextQueryPort: ContextQueryPort = {
      request: vi.fn().mockResolvedValue({
        type: 'channel.lookupByPhone',
        item: { chatId: 321, channelId: '321', username: 'alice' },
      }),
    };

    const plan = await buildPlan({ event, context: baseContext }, { contentPort, contextQueryPort });

    expect(contextQueryPort.request).toHaveBeenCalledWith({
      type: 'channel.lookupByPhone',
      phoneNormalized: '89643805480',
      resource: 'telegram',
    });
    expect(plan).toHaveLength(1);
    expect(plan[0]).toMatchObject({
      kind: 'event.log',
      payload: { route: 'telegram', chatId: 321 },
    });
  });
});
