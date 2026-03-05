import { describe, expect, it, vi } from 'vitest';
import type { ActionResult, DomainContext, IncomingEvent } from '../contracts/index.js';
import { handleIncomingEvent } from './handleIncomingEvent.js';

describe('handleIncomingEvent (v3)', () => {
  it('builds context, resolves script, executes actions and aggregates outputs', async () => {
    const event: IncomingEvent = {
      type: 'webhook.received',
      meta: {
        eventId: 'evt-1',
        occurredAt: '2026-03-05T12:00:00.000Z',
        source: 'rubitime',
      },
      payload: { body: { event: 'event-create-record' } },
    };

    const context: DomainContext = {
      event,
      nowIso: '2026-03-05T12:00:00.000Z',
      values: {},
    };

    const buildContext = vi.fn().mockResolvedValue(context);
    const resolveScript = vi.fn().mockResolvedValue([
      { id: 's1', action: 'booking.upsert', mode: 'sync', params: { rubitimeRecordId: 'rec-1' } },
      { id: 's2', action: 'message.compose', mode: 'async', params: { text: 'hello' } },
    ]);

    const executeAction = vi.fn<
      (action: { id: string }, context: DomainContext) => Promise<ActionResult>
    >().mockImplementation(async (action) => {
      if (action.id === 's1') {
        return {
          actionId: 's1',
          status: 'success',
          writes: [{ type: 'booking.upsert', params: { rubitimeRecordId: 'rec-1' } }],
        };
      }
      return {
        actionId: 's2',
        status: 'success',
        intents: [{
          type: 'message.send',
          meta: {
            eventId: 'out-1',
            occurredAt: '2026-03-05T12:00:00.000Z',
            source: 'rubitime',
          },
          payload: { message: { text: 'hello' } },
        }],
      };
    });

    const result = await handleIncomingEvent(event, {
      buildContext,
      resolveScript,
      executeAction,
    });

    expect(buildContext).toHaveBeenCalledTimes(1);
    expect(resolveScript).toHaveBeenCalledTimes(1);
    expect(executeAction).toHaveBeenCalledTimes(2);
    expect(result.writes.length).toBe(1);
    expect(result.intents.length).toBe(1);
  });
});
