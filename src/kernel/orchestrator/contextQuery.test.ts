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
      getScript: vi.fn().mockResolvedValue(null),
      getTemplate: vi.fn().mockResolvedValue(null),
    };

    const contextQueryPort: ContextQueryPort = {
      request: vi.fn().mockResolvedValue({ type: 'subscriptions.forUser', items: [] }),
    };

    const plan = await buildPlan({ event, context: baseContext }, { contentPort, contextQueryPort });

    expect(contextQueryPort.request).toHaveBeenCalledTimes(1);
    expect(plan.length).toBeGreaterThan(0);
  });
});
