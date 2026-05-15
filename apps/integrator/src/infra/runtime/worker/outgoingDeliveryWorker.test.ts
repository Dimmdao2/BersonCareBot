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

describe('reminder_dispatch outgoing delivery row', () => {
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

  it('max: without stale id dispatches send only once and logs success', async () => {
    const dispatchOutgoing = vi.fn().mockImplementation(async (intent: { type: string }) => {
      if (intent.type === 'message.send') return { maxMessageId: 'mid-only-send' };
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
          occurrenceId: 'occ-no-stale',
          channel: 'max',
          deliveryLogId: 'rdl:occ-no-stale:max',
          externalId: '300',
          logText: '<b>r</b>',
          intent: {
            type: 'message.send',
            meta: { eventId: 'e3', occurredAt: '2026-01-01T00:00:00.000Z', source: 'max', userId: 'u1' },
            payload: {
              recipient: { chatId: 300 },
              message: { text: 'Hi' },
              delivery: { channels: ['max'], maxAttempts: 1 },
            },
          },
        },
      }),
      { db: db as never, writePort: { writeDb } as never, dispatchOutgoing },
    );
    expect(dispatchOutgoing).toHaveBeenCalledTimes(1);
    expect(dispatchOutgoing.mock.calls[0]?.[0]).toMatchObject({ type: 'message.send' });
    const logCall = writeDb.mock.calls.find((c) => c[0]?.type === 'reminders.delivery.log');
    expect(logCall?.[0]?.params?.payloadJson).toMatchObject({ maxMessageId: 'mid-only-send' });
  });

  it('max: stale delete throws but send still runs and logs maxMessageId', async () => {
    const dispatchOutgoing = vi.fn().mockImplementation(async (intent: { type: string }) => {
      if (intent.type === 'message.delete') throw new Error('delete failed');
      if (intent.type === 'message.send') return { maxMessageId: 'mid-after-soft-fail' };
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
          occurrenceId: 'occ-del-fail',
          channel: 'max',
          deliveryLogId: 'rdl:occ-del-fail:max',
          externalId: '400',
          logText: '<b>x</b>',
          deleteBeforeSendMessageId: 'stale-bad',
          intent: {
            type: 'message.send',
            meta: { eventId: 'e4', occurredAt: '2026-01-01T00:00:00.000Z', source: 'max', userId: 'u1' },
            payload: {
              recipient: { chatId: 400 },
              message: { text: 'Hi' },
              delivery: { channels: ['max'], maxAttempts: 1 },
            },
          },
        },
      }),
      { db: db as never, writePort: { writeDb } as never, dispatchOutgoing },
    );
    expect(dispatchOutgoing).toHaveBeenCalledTimes(2);
    expect(dispatchOutgoing.mock.calls[0]?.[0]).toMatchObject({ type: 'message.delete' });
    expect(dispatchOutgoing.mock.calls[1]?.[0]).toMatchObject({ type: 'message.send' });
    const logCall = writeDb.mock.calls.find((c) => c[0]?.type === 'reminders.delivery.log');
    expect(logCall?.[0]?.params?.payloadJson).toMatchObject({
      maxMessageId: 'mid-after-soft-fail',
    });
  });

  it('telegram: stale delete throws but send still runs and logs telegramMessageId', async () => {
    const dispatchOutgoing = vi.fn().mockImplementation(async (intent: { type: string }) => {
      if (intent.type === 'message.delete') throw new Error('tg delete failed');
      if (intent.type === 'message.send') return { telegramMessageId: 1001 };
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
          occurrenceId: 'occ-tg-del-fail',
          channel: 'telegram',
          deliveryLogId: 'rdl:occ-tg-del-fail:telegram',
          externalId: '500',
          logText: 't',
          deleteBeforeSendMessageId: '77',
          intent: {
            type: 'message.send',
            meta: { eventId: 'e5', occurredAt: '2026-01-01T00:00:00.000Z', source: 'telegram', userId: 'u1' },
            payload: {
              recipient: { chatId: 500 },
              message: { text: 'Hi' },
              delivery: { channels: ['telegram'], maxAttempts: 1 },
            },
          },
        },
      }),
      { db: db as never, writePort: { writeDb } as never, dispatchOutgoing },
    );
    expect(dispatchOutgoing).toHaveBeenCalledTimes(2);
    expect(dispatchOutgoing.mock.calls[0]?.[0]).toMatchObject({
      type: 'message.delete',
      payload: { messageId: 77 },
    });
    expect(dispatchOutgoing.mock.calls[1]?.[0]).toMatchObject({ type: 'message.send' });
    const logCall = writeDb.mock.calls.find((c) => c[0]?.type === 'reminders.delivery.log');
    expect(logCall?.[0]?.params?.payloadJson).toMatchObject({
      telegramMessageId: '1001',
    });
  });
});

import { markOutgoingDeliveryDead } from '../../db/repos/outgoingDeliveryQueue.js';

describe('doctor_broadcast_intent outgoing delivery row', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('success: dispatch, mark sent, increment broadcast_audit.sent_count', async () => {
    const dispatchOutgoing = vi.fn().mockResolvedValue({});
    const auditId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    const db = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
    };
    await processOutgoingDeliveryRow(
      baseRow({
        kind: 'doctor_broadcast_intent',
        channel: 'telegram',
        payloadJson: {
          broadcastAuditId: auditId,
          clientUserId: 'u1',
          intent: {
            type: 'message.send',
            meta: {
              eventId: 'e-d',
              occurredAt: '2026-01-01T00:00:00.000Z',
              source: 'telegram',
              userId: 'u1',
            },
            payload: {
              recipient: { chatId: 1 },
              message: { text: 'Hi' },
              delivery: { channels: ['telegram'], maxAttempts: 1 },
            },
          },
        },
      }),
      { db: db as never, writePort: { writeDb: vi.fn() } as never, dispatchOutgoing },
    );
    expect(dispatchOutgoing).toHaveBeenCalledTimes(1);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('broadcast_audit'),
      expect.arrayContaining([auditId]),
    );
  });

  it('missing broadcastAuditId: marks dead without dispatch', async () => {
    const dispatchOutgoing = vi.fn();
    const db = { query: vi.fn().mockResolvedValue({ rows: [] }) };
    await processOutgoingDeliveryRow(
      baseRow({
        kind: 'doctor_broadcast_intent',
        channel: 'telegram',
        payloadJson: {
          intent: {
            type: 'message.send',
            meta: { eventId: 'e1', occurredAt: '2026-01-01T00:00:00.000Z', source: 'telegram' },
            payload: {
              recipient: { chatId: 1 },
              message: { text: 'Hi' },
              delivery: { channels: ['telegram'], maxAttempts: 1 },
            },
          },
        },
      }),
      { db: db as never, writePort: { writeDb: vi.fn() } as never, dispatchOutgoing },
    );
    expect(dispatchOutgoing).not.toHaveBeenCalled();
    const sql = db.query.mock.calls.map((c) => String(c[0])).join('\n');
    expect(sql).toContain('dead');
  });
});
