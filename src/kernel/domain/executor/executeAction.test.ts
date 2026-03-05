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

  it('handles legacy rubitime.create_retry.enqueue action', async () => {
    const writeDb = vi.fn().mockResolvedValue(undefined);
    const action: Action = {
      id: 'a5',
      type: 'rubitime.create_retry.enqueue',
      mode: 'async',
      params: {
        phoneNormalized: '+79990001122',
        messageText: 'hello',
        firstTryDelaySeconds: 60,
        maxAttempts: 2,
      },
    };

    const result = await executeAction(action, ctx, {
      writePort: { writeDb },
    });

    expect(result.status).toBe('queued');
    expect(writeDb).toHaveBeenCalledTimes(1);
  });

  it('handles message.deliver by creating ready delivery job', async () => {
    const enqueue = vi.fn().mockResolvedValue(undefined);
    const action: Action = {
      id: 'a6',
      type: 'message.deliver',
      mode: 'async',
      params: {
        payload: {
          message: { text: 'ready-message' },
          delivery: { channels: ['telegram', 'smsc'] },
        },
        targets: [
          { resource: 'telegram', address: { chatId: 123 } },
          { resource: 'smsc', address: { phoneNormalized: '+79990001122' } },
        ],
        retry: {
          maxAttempts: 3,
          backoffSeconds: [0, 60, 120],
        },
        onFail: {
          adminNotifyIntent: {
            type: 'message.send',
            meta: {
              eventId: 'debug-1',
              occurredAt: '2026-03-05T12:00:00.000Z',
              source: 'domain',
            },
            payload: { message: { text: 'debug' } },
          },
        },
      },
    };

    const result = await executeAction(action, ctx, {
      queuePort: { enqueue },
    });

    expect(result.status).toBe('queued');
    expect(result.jobs?.[0]?.kind).toBe('message.deliver');
    expect(result.jobs?.[0]?.payload?.intent).toBeTruthy();
    expect(result.jobs?.[0]?.targets?.length).toBeGreaterThan(0);
    expect(result.jobs?.[0]?.retry?.maxAttempts).toBe(3);
    expect(enqueue).toHaveBeenCalledTimes(1);
  });
});
