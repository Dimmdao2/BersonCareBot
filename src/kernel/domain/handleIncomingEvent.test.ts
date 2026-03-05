import { describe, expect, it, vi } from 'vitest';
import type { ActionResult, BaseContext, DomainContext, IncomingEvent, Step } from '../contracts/index.js';
import { handleIncomingEvent } from './handleIncomingEvent.js';

describe('handleIncomingEvent (v3)', () => {
  it('builds context, resolves script, executes actions and aggregates outputs', async () => {
    const event: IncomingEvent = {
      type: 'webhook.received',
      meta: {
        eventId: 'evt-1',
        occurredAt: '2026-03-05T12:00:00.000Z',
        source: 'source-a',
      },
      payload: { body: { event: 'event-create-record' } },
    };

    const baseContext: BaseContext = {
      actor: { isAdmin: false },
      identityLinks: [],
    };

    const context: DomainContext = {
      event,
      nowIso: '2026-03-05T12:00:00.000Z',
      values: {},
      base: baseContext,
    };

    const buildBaseContext = vi.fn().mockResolvedValue(baseContext);
    const buildPlan = vi.fn().mockResolvedValue([
      { id: 's1', kind: 'booking.upsert', mode: 'sync', payload: { externalRecordId: 'rec-1' } },
      { id: 's2', kind: 'message.compose', mode: 'async', payload: { text: 'hello' } },
    ]) as unknown as () => Promise<Step[]>;

    const executeAction = vi.fn<
      (action: { id: string }, context: DomainContext) => Promise<ActionResult>
    >().mockImplementation(async (action) => {
      if (action.id === 's1') {
        return {
          actionId: 's1',
          status: 'success',
          writes: [{ type: 'booking.upsert', params: { externalRecordId: 'rec-1' } }],
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
            source: 'source-a',
          },
          payload: { message: { text: 'hello' } },
        }],
      };
    });

    const result = await handleIncomingEvent(event, {
      buildBaseContext,
      buildPlan,
      executeAction,
    });

    expect(buildBaseContext).toHaveBeenCalledTimes(1);
    expect(buildPlan).toHaveBeenCalledTimes(1);
    expect(executeAction).toHaveBeenCalledTimes(2);
    expect(result.writes.length).toBe(1);
    expect(result.intents.length).toBe(1);
  });
});
