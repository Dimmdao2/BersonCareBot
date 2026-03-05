import { describe, expect, it, vi } from 'vitest';
import type { ContentPort, ContextQueryPort, IncomingEvent, Orchestrator } from '../contracts/index.js';
import { createIncomingEventPipeline } from './incomingEventPipeline.js';
import { createOrchestrator } from '../orchestrator/index.js';

describe('incomingEventPipeline', () => {
  it('webhook -> orchestrator -> domain enqueues delivery job for async retry flow', async () => {
    const writeDb = vi.fn().mockResolvedValue(undefined);
    const enqueue = vi.fn().mockResolvedValue(undefined);
    const dispatchOutgoing = vi.fn().mockResolvedValue(undefined);

    const contentPort: ContentPort = {
      getScript: vi.fn().mockResolvedValue({
        id: 'webhook.received',
        steps: [
          {
            action: 'rubitime.create_retry.enqueue',
            mode: 'async',
            params: {
              phoneNormalized: '+79990001122',
              messageText: 'hello',
              firstTryDelaySeconds: 1,
              maxAttempts: 2,
            },
          },
        ],
      }),
      getTemplate: vi.fn().mockResolvedValue(null),
    };
    const contextQueryPort: ContextQueryPort = {
      request: vi.fn().mockResolvedValue({ type: 'subscriptions.forUser', items: [] }),
    };
    const orchestrator: Orchestrator = createOrchestrator({ contentPort, contextQueryPort });

    const pipeline = createIncomingEventPipeline({
      readPort: {
        readDb: vi.fn().mockResolvedValue(null),
      },
      writePort: { writeDb },
      queuePort: { enqueue },
      dispatchPort: { dispatchOutgoing },
      orchestrator,
    });

    const event: IncomingEvent = {
      type: 'webhook.received',
      meta: {
        eventId: 'evt-rubitime-1',
        occurredAt: '2026-03-05T12:00:00.000Z',
        source: 'rubitime',
      },
      payload: {
        body: {
          event: 'event-create-record',
          data: {
            id: 'rec-1',
            phone: '+79990001122',
            record: '2026-03-05 15:00',
            status: 1,
          },
        },
      },
    };

    await pipeline.run(event);

    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(dispatchOutgoing).not.toHaveBeenCalled();
    expect(writeDb).toHaveBeenCalled();
  });
});
