import { describe, expect, it, vi } from 'vitest';
import type { ActionResult, Orchestrator, IncomingEvent } from '../contracts/index.js';
import { logger } from '../../infra/observability/logger.js';
import { processAcceptedIncomingEvent } from './usecases/processAcceptedIncomingEvent.js';

describe('processAcceptedIncomingEvent', () => {
  it('executes plan and dispatches intents', async () => {
    const event: IncomingEvent = {
      type: 'webhook.received',
      meta: {
        eventId: 'evt-1',
        occurredAt: '2026-03-05T12:00:00.000Z',
        source: 'source-a',
      },
      payload: {
        body: { event: 'event-create-record' },
        incoming: { channelId: '123' },
      },
    };

    const orchestrator: Orchestrator = {
      buildPlan: vi.fn().mockResolvedValue([
        { id: 's1', kind: 'event.log', mode: 'sync', payload: { eventId: 'evt-1' } },
        { id: 's2', kind: 'message.send', mode: 'async', payload: { message: { text: 'hi' } } },
      ]),
    };

    const executeAction = vi.fn<
      (action: { id: string }, context: unknown) => Promise<ActionResult>
    >().mockImplementation(async (action) => {
      if (action.id === 's2') {
        return {
          actionId: 's2',
          status: 'success',
          intents: [
            {
              type: 'message.send',
              meta: {
                eventId: 'out-1',
                occurredAt: '2026-03-05T12:00:00.000Z',
                source: 'source-a',
              },
              payload: { message: { text: 'hi' } },
            },
          ],
        };
      }
      return { actionId: action.id, status: 'success' };
    });

    const dispatchIntent = vi.fn().mockResolvedValue(undefined);
    const readPort = {
      readDb: vi.fn().mockResolvedValue({
        channelId: '123',
        phoneNormalized: '+79990001122',
        userState: 'idle',
      }),
    };

    await processAcceptedIncomingEvent(event, {
      readPort,
      orchestrator,
      executeAction,
      dispatchIntent,
    });

    expect(orchestrator.buildPlan).toHaveBeenCalledTimes(1);
    expect(readPort.readDb).toHaveBeenCalledWith({
      type: 'user.byIdentity',
      params: { resource: 'source-a', externalId: '123' },
    });
    expect(executeAction).toHaveBeenCalledTimes(2);
    expect(dispatchIntent).toHaveBeenCalledTimes(1);
  });

  it('continues dispatching intents after first dispatchIntent rejects', async () => {
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});

    const event: IncomingEvent = {
      type: 'webhook.received',
      meta: {
        eventId: 'evt-chain',
        occurredAt: '2026-03-05T12:00:00.000Z',
        source: 'telegram',
      },
      payload: {
        incoming: { channelId: '123' },
      },
    };

    const orchestrator: Orchestrator = {
      buildPlan: vi.fn().mockResolvedValue([
        { id: 's-chain', kind: 'event.log', mode: 'sync', payload: { eventId: 'evt-chain' } },
      ]),
    };

    const executeAction = vi.fn().mockResolvedValue({
      actionId: 's-chain',
      status: 'success',
      intents: [
        {
          type: 'message.edit',
          meta: { eventId: 'out-a', occurredAt: '2026-03-05T12:00:00.000Z', source: 'telegram' },
          payload: { recipient: { chatId: 1 }, messageId: 1, message: { text: 'x' } },
        },
        {
          type: 'callback.answer',
          meta: { eventId: 'out-b', occurredAt: '2026-03-05T12:00:00.000Z', source: 'telegram' },
          payload: { callbackQueryId: 'cb-2' },
        },
      ],
    });

    const dispatchIntent = vi.fn()
      .mockRejectedValueOnce(new Error('TELEGRAM_EDIT_FAILED'))
      .mockResolvedValueOnce(undefined);

    const readPort = {
      readDb: vi.fn().mockResolvedValue({
        channelId: '123',
        phoneNormalized: '+79990001122',
        userState: 'idle',
      }),
    };

    await processAcceptedIncomingEvent(event, {
      readPort,
      orchestrator,
      executeAction,
      dispatchIntent,
    });

    expect(dispatchIntent).toHaveBeenCalledTimes(2);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
