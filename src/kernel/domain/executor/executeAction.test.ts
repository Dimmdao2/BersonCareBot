import { describe, expect, it, vi } from 'vitest';
import type { Action, DomainContext } from '../../contracts/index.js';
import { executeAction } from './executeAction.js';

const ctx: DomainContext = {
  event: {
    type: 'webhook.received',
    meta: {
      eventId: 'evt-1',
      occurredAt: '2026-03-05T12:00:00.000Z',
      source: 'rubitime',
    },
    payload: {},
  },
  nowIso: '2026-03-05T12:00:00.000Z',
  values: {},
};

describe('executeAction', () => {
  it('handles booking.upsert', async () => {
    const writeDb = vi.fn().mockResolvedValue(undefined);
    const action: Action = {
      id: 'a1',
      type: 'booking.upsert',
      mode: 'sync',
      params: { rubitimeRecordId: 'rec-1' },
    };

    const result = await executeAction(action, ctx, {
      writePort: { writeDb },
    });

    expect(result.status).toBe('success');
    expect(writeDb).toHaveBeenCalledTimes(1);
  });

  it('handles message.compose with template', async () => {
    const action: Action = {
      id: 'a2',
      type: 'message.compose',
      mode: 'sync',
      params: {
        source: 'rubitime',
        templateId: 'booking.accepted',
        vars: { name: 'test' },
        recipient: { phoneNormalized: '+79990001122' },
        delivery: { channels: ['smsc'], maxAttempts: 1 },
      },
    };

    const result = await executeAction(action, ctx, {
      templatePort: {
        renderTemplate: vi.fn().mockResolvedValue({ text: 'hello' }),
      },
    });

    expect(result.status).toBe('success');
    expect(result.intents?.[0]?.type).toBe('message.send');
  });

  it('handles intent.enqueueDelivery', async () => {
    const enqueue = vi.fn().mockResolvedValue(undefined);
    const action: Action = {
      id: 'a3',
      type: 'intent.enqueueDelivery',
      mode: 'async',
      params: {
        kind: 'delivery.retry',
        maxAttempts: 2,
        payload: { intentId: 'out-1' },
      },
    };

    const result = await executeAction(action, ctx, {
      queuePort: { enqueue },
    });

    expect(result.status).toBe('queued');
    expect(result.jobs?.[0]?.kind).toBe('delivery.retry');
    expect(enqueue).toHaveBeenCalledTimes(1);
  });

  it('handles user.findByPhone', async () => {
    const readDb = vi.fn().mockResolvedValue({ id: 'u1' });
    const action: Action = {
      id: 'a4',
      type: 'user.findByPhone',
      mode: 'sync',
      params: { phoneNormalized: '+79990001122' },
    };

    const result = await executeAction(action, ctx, {
      readPort: { readDb },
    });

    expect(result.status).toBe('success');
    expect(readDb).toHaveBeenCalledTimes(1);
  });
});
