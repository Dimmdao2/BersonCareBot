import { describe, expect, it, vi } from 'vitest';
import type { ContentPort, ContextQueryPort, IncomingEvent, Orchestrator } from '../contracts/index.js';
import { createIncomingEventPipeline } from './incomingEventPipeline.js';
import { createOrchestrator } from '../orchestrator/index.js';
import { createTemplatePort } from '../../infra/adapters/templatePort.js';

describe('incomingEventPipeline', () => {
  it('webhook -> orchestrator -> domain enqueues delivery job for async retry flow', async () => {
    const writeDb = vi.fn().mockResolvedValue(undefined);
    const enqueue = vi.fn().mockResolvedValue(undefined);
    const dispatchOutgoing = vi.fn().mockResolvedValue(undefined);
    const readDb = vi.fn().mockResolvedValue({
      channelId: '123',
      phoneNormalized: '+79990001122',
      userState: 'idle',
    });

    const contentPort: ContentPort = {
      getScriptsBySource: vi.fn().mockResolvedValue([
        {
          id: 'webhook.received',
          source: 'source-a',
          event: 'webhook.received',
          steps: [
            {
              action: 'message.retry.enqueue',
              mode: 'async',
              params: {
                phoneNormalized: '+79990001122',
                messageText: 'hello',
                firstTryDelaySeconds: 1,
                maxAttempts: 2,
              },
            },
          ],
        },
      ]),
      getTemplate: vi.fn().mockResolvedValue(null),
    };
    const contextQueryPort: ContextQueryPort = {
      request: vi.fn().mockResolvedValue({ type: 'subscriptions.forUser', items: [] }),
    };
    const orchestrator: Orchestrator = createOrchestrator({ contentPort, contextQueryPort });
    const templatePort = createTemplatePort({ contentPort });

    const pipeline = createIncomingEventPipeline({
      readPort: {
        readDb,
      },
      writePort: { writeDb },
      queuePort: { enqueue },
      dispatchPort: { dispatchOutgoing },
      orchestrator,
      templatePort,
    });

    const event: IncomingEvent = {
      type: 'webhook.received',
      meta: {
        eventId: 'evt-source-1',
        occurredAt: '2026-03-05T12:00:00.000Z',
        source: 'source-a',
      },
      payload: {
        incoming: {
          channelId: '123',
        },
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

    expect(readDb.mock.calls).toContainEqual([
      {
        type: 'user.byIdentity',
        params: { resource: 'source-a', externalId: '123' },
      },
    ]);
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(dispatchOutgoing).not.toHaveBeenCalled();
    expect(writeDb).toHaveBeenCalled();
  });

  it('passes a real template port into domain execution', async () => {
    const writeDb = vi.fn().mockResolvedValue(undefined);
    const enqueue = vi.fn().mockResolvedValue(undefined);
    const dispatchOutgoing = vi.fn().mockResolvedValue(undefined);
    const readDb = vi.fn().mockResolvedValue({
      channelId: '123',
      phoneNormalized: '+79990001122',
      userState: 'idle',
    });

    const contentPort: ContentPort = {
      getScriptsBySource: vi.fn().mockResolvedValue([
        {
          id: 'telegram.start',
          source: 'telegram',
          event: 'message.received',
          steps: [
            {
              action: 'message.compose',
              mode: 'async',
              params: {
                source: 'telegram',
                templateId: 'chooseMenu',
                recipient: { chatId: 123 },
                delivery: { channels: ['telegram'], maxAttempts: 1 },
                vars: { title: 'ignored' },
              },
            },
          ],
        },
      ]),
      getTemplate: vi.fn().mockImplementation(async (_scope: { source: string; audience: string }, templateId: string) => {
        if (templateId === 'chooseMenu') return { id: 'chooseMenu', text: 'Выберите действие' };
        return null;
      }),
    };
    const contextQueryPort: ContextQueryPort = {
      request: vi.fn().mockResolvedValue({}),
    };
    const orchestrator: Orchestrator = createOrchestrator({ contentPort, contextQueryPort });
    const templatePort = createTemplatePort({ contentPort });

    const pipeline = createIncomingEventPipeline({
      readPort: { readDb },
      writePort: { writeDb },
      queuePort: { enqueue },
      dispatchPort: { dispatchOutgoing },
      orchestrator,
      templatePort,
    });

    const event: IncomingEvent = {
      type: 'message.received',
      meta: {
        eventId: 'evt-template-1',
        occurredAt: '2026-03-05T12:00:00.000Z',
        source: 'telegram',
      },
      payload: {
        incoming: {
          channelId: '123',
          chatId: 123,
        },
      },
    };

    await pipeline.run(event);

    expect(dispatchOutgoing).toHaveBeenCalledWith(expect.objectContaining({
      type: 'message.send',
      payload: expect.objectContaining({
        message: { text: 'Выберите действие' },
      }),
    }));
  });
});
