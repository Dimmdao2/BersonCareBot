import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../db/repos/outgoingDeliveryQueue.js', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../db/repos/outgoingDeliveryQueue.js')>();
  return {
    ...mod,
    markOutgoingDeliverySent: vi.fn().mockResolvedValue(undefined),
  };
});

import type { OutgoingDeliveryQueueRow } from '../../db/repos/outgoingDeliveryQueue.js';
import { processOutgoingDeliveryRow } from './outgoingDeliveryWorker.js';

function baseRow(overrides: Partial<OutgoingDeliveryQueueRow>): OutgoingDeliveryQueueRow {
  return {
    id: 'q1',
    eventId: 'ev1',
    kind: 'reminder_dispatch',
    channel: 'max',
    payloadJson: {},
    status: 'processing',
    attemptCount: 0,
    maxAttempts: 3,
    nextRetryAt: new Date().toISOString(),
    lastAttemptAt: null,
    sentAt: null,
    deadAt: null,
    lastError: null,
    ...overrides,
  };
}

describe('processOutgoingDeliveryRow reminder_dispatch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('max: stale delete then send; logs maxMessageId on success', async () => {
    const dispatchOutgoing = vi.fn().mockImplementation(async (intent: { type: string }) => {
      if (intent.type === 'message.delete') return {};
      if (intent.type === 'message.send') return { maxMessageId: 'mid-new' };
      return {};
    });
    const writeDb = vi.fn().mockResolvedValue(undefined);
    const db = {
      query: vi.fn().mockResolvedValue({ rows: [{ status: 'queued' }] }),
    };
    await processOutgoingDeliveryRow(
      baseRow({
        channel: 'max',
        payloadJson: {
          occurrenceId: 'occ-1',
          channel: 'max',
          deliveryLogId: 'rdl:occ-1:max',
          externalId: '200',
          logText: '<b>x</b>',
          deleteBeforeSendMessageId: 'stale-mid',
          intent: {
            type: 'message.send',
            meta: { eventId: 'e1', occurredAt: '2026-01-01T00:00:00.000Z', source: 'max', userId: 'u1' },
            payload: {
              recipient: { chatId: 200 },
              message: { text: 'Hi' },
              delivery: { channels: ['max'], maxAttempts: 1 },
            },
          },
        },
      }),
      { db: db as never, writePort: { writeDb } as never, dispatchOutgoing },
    );
    expect(dispatchOutgoing).toHaveBeenCalledTimes(2);
    expect(dispatchOutgoing.mock.calls[0]?.[0]).toMatchObject({
      type: 'message.delete',
      meta: { source: 'max' },
      payload: { messageId: 'stale-mid' },
    });
    expect(dispatchOutgoing.mock.calls[1]?.[0]).toMatchObject({ type: 'message.send' });
    const logCall = writeDb.mock.calls.find((c) => c[0]?.type === 'reminders.delivery.log');
    expect(logCall?.[0]?.params?.payloadJson).toMatchObject({
      maxMessageId: 'mid-new',
    });
  });

  it('telegram: accepts legacy deleteBeforeSendTelegramMessageId', async () => {
    const dispatchOutgoing = vi.fn().mockImplementation(async (intent: { type: string }) => {
      if (intent.type === 'message.delete') return {};
      if (intent.type === 'message.send') return { telegramMessageId: 99 };
      return {};
    });
    const writeDb = vi.fn().mockResolvedValue(undefined);
    const db = {
      query: vi.fn().mockResolvedValue({ rows: [{ status: 'queued' }] }),
    };
    await processOutgoingDeliveryRow(
      baseRow({
        channel: 'telegram',
        payloadJson: {
          occurrenceId: 'occ-2',
          channel: 'telegram',
          deliveryLogId: 'rdl:occ-2:telegram',
          externalId: '42',
          logText: 't',
          deleteBeforeSendTelegramMessageId: 55,
          intent: {
            type: 'message.send',
            meta: { eventId: 'e2', occurredAt: '2026-01-01T00:00:00.000Z', source: 'telegram' },
            payload: {
              recipient: { chatId: 42 },
              message: { text: 'Hi' },
              delivery: { channels: ['telegram'], maxAttempts: 1 },
            },
          },
        },
      }),
      { db: db as never, writePort: { writeDb } as never, dispatchOutgoing },
    );
    expect(dispatchOutgoing.mock.calls[0]?.[0]).toMatchObject({
      type: 'message.delete',
      payload: { messageId: 55 },
    });
    const logCall = writeDb.mock.calls.find((c) => c[0]?.type === 'reminders.delivery.log');
    expect(logCall?.[0]?.params?.payloadJson).toMatchObject({
      telegramMessageId: '99',
    });
  });
});
