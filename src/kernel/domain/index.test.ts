import { describe, expect, it } from 'vitest';
import type { Step } from '../contracts/steps.js';
import type { ScriptContext } from '../contracts/scripts.js';
import { executeStep } from './index.js';

const ctx: ScriptContext = {
  event: {
    type: 'message.received',
    meta: {
      eventId: 'evt-1',
      source: 'telegram',
      occurredAt: '2026-03-03T00:00:00.000Z',
      correlationId: 'corr-1',
    },
    payload: {},
  },
  values: {},
};

describe('domain executeStep', () => {
  it('returns event.log write mutation', async () => {
    const step: Step = {
      id: 'step-1',
      kind: 'event.log',
      mode: 'sync',
      payload: { foo: 'bar' },
    };

    const result = await executeStep(step, ctx);
    expect(result.status).toBe('success');
    expect(result.data?.writes).toEqual([{ type: 'event.log', params: step.payload }]);
  });

  it('returns booking.upsert write mutation', async () => {
    const step: Step = {
      id: 'step-2',
      kind: 'booking.upsert',
      mode: 'sync',
      payload: { rubitimeRecordId: 'rec-1' },
    };

    const result = await executeStep(step, ctx);
    expect(result.status).toBe('success');
    expect(result.data?.writes).toEqual([{ type: 'booking.upsert', params: step.payload }]);
  });

  it('builds message.send outgoing with default channels', async () => {
    const step: Step = {
      id: 'step-3',
      kind: 'message.send',
      mode: 'async',
      payload: {
        recipient: { chatId: 1, phoneNormalized: '+79990001122' },
        message: { text: 'hi' },
      },
    };

    const result = await executeStep(step, ctx);
    const outgoing = result.data?.outgoing as Array<{ payload: Record<string, unknown> }>;
    expect(outgoing).toHaveLength(1);
    const delivery = (outgoing[0]?.payload as { delivery?: { channels?: unknown; maxAttempts?: unknown } }).delivery;
    expect(delivery?.channels).toEqual(['telegram', 'smsc']);
    expect(delivery?.maxAttempts).toBe(3);
  });

  it('keeps explicit delivery channels and attempts', async () => {
    const step: Step = {
      id: 'step-4',
      kind: 'message.send',
      mode: 'async',
      payload: {
        recipient: { phoneNormalized: '+79990001122' },
        message: { text: 'hi' },
        delivery: { channels: ['smsc'], maxAttempts: 5 },
      },
    };

    const result = await executeStep(step, ctx);
    const outgoing = result.data?.outgoing as Array<{ payload: Record<string, unknown> }>;
    expect(outgoing).toHaveLength(1);
    const delivery = (outgoing[0]?.payload as { delivery?: { channels?: unknown; maxAttempts?: unknown } }).delivery;
    expect(delivery?.channels).toEqual(['smsc']);
    expect(delivery?.maxAttempts).toBe(5);
  });
});
