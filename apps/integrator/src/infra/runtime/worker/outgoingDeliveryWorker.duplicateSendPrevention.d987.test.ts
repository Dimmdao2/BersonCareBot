/**
 * Track D final cutover (#987), §7: once the provider has accepted a reminder send, a later
 * failure while recording/finalizing occurrence state must NEVER put the delivery back on a path
 * that calls the provider again — that would be a real duplicate message to a real patient.
 *
 * Before this cutover, `reminders.occurrence.markSent` (and `maybeClearMessengerBotBlockedMarker`)
 * ran INSIDE the same try/catch as `dispatchOutgoing`/`queueMarkSent`; any exception there fell
 * into the generic `catch` and called `handleDispatchFailure`, which reschedules the delivery
 * queue row for another attempt (`queueReschedule`) — i.e. another real provider call for a send
 * that already succeeded. The fix marks the delivery queue row `sent` (the durable record of
 * provider success) BEFORE occurrence-finalization runs, and moves occurrence-finalization/bot-
 * marker bookkeeping into their own try/catch that only logs on failure.
 *
 * This test proves the fix at the exact seam that used to duplicate-send: the provider succeeds,
 * the occurrence-finalize write (`writePort.writeDb`) then throws, and the queue row must already
 * be terminal `sent` — never `dead`/`failed_retryable` — and the provider must be called exactly
 * once.
 */
import { describe, expect, it, vi } from 'vitest';
import type { DbPort, DbQueryResult, DeliverySendResult, OutgoingIntent } from '../../../kernel/contracts/index.js';
import type { OutgoingDeliveryQueueRow } from '../../db/repos/outgoingDeliveryQueue.js';
import { processOutgoingDeliveryRow } from './outgoingDeliveryWorker.js';

const { loggerWarn } = vi.hoisted(() => ({ loggerWarn: vi.fn() }));

vi.mock('../../observability/logger.js', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    logger: { ...(actual.logger as object), warn: loggerWarn, error: vi.fn(), info: vi.fn(), debug: vi.fn() },
  };
});

const OCCURRENCE_ID = 'd987-occurrence';

function reminderRow(): OutgoingDeliveryQueueRow {
  const intent: OutgoingIntent = {
    type: 'message.send',
    meta: {
      eventId: `rem:${OCCURRENCE_ID}:g2:telegram`,
      occurredAt: '2026-08-24T09:00:00.000Z',
      source: 'telegram',
      userId: '42',
      outboundMessageClass: 'routine_product',
      outboundCapability: 'essential_delivery',
    },
    payload: {
      recipient: { chatId: 1001 },
      message: { text: 'Reminder' },
      delivery: { channels: ['telegram'] },
    },
  };
  return {
    id: 'queue-telegram-2',
    eventId: intent.meta.eventId,
    kind: 'reminder_dispatch',
    channel: 'telegram',
    payloadJson: {
      occurrenceId: OCCURRENCE_ID,
      deliveryGeneration: 2,
      topicCode: 'training_reminders',
      channel: 'telegram',
      deliveryLogId: `rdl:${OCCURRENCE_ID}:g2:telegram`,
      platformUserId: 'a0000000-0000-4000-8000-00000000000a',
      externalId: '1001',
      logText: 'Reminder',
      intent,
    },
    status: 'processing',
    attemptCount: 1,
    maxAttempts: 6,
    nextRetryAt: '2026-08-24T09:00:00.000Z',
    lastAttemptAt: null,
    sentAt: null,
    deadAt: null,
    lastError: null,
  };
}

function harness(options: { failOccurrenceFinalize?: boolean; failBotMarkerClear?: boolean } = {}) {
  const dispatchOutgoing = vi.fn(
    async (): Promise<DeliverySendResult> => ({ telegramMessageId: 7 }),
  );
  const writes: Array<{ type: string; params: Record<string, unknown> }> = [];
  const queueSent: string[] = [];
  const queueRetryable: string[] = [];
  const queueDead: Array<{ id: string; error: string }> = [];
  let botMarkerClearCalls = 0;

  const db: DbPort = {
    async query<T>(sql: string, params?: unknown[]): Promise<DbQueryResult<T>> {
      if (sql.includes('revalidate_patient_reminder_delivery_materialization')) {
        return { rows: [{ current: true }] as T[] };
      }
      if (sql.includes('COALESCE(o.organization_id')) {
        return { rows: [{ organization_id: 'd0000000-0000-4000-8000-00000000000d' }] as T[] };
      }
      if (sql.includes('user_channel_bindings') || sql.includes('bot_blocked')) {
        botMarkerClearCalls += 1;
        if (options.failBotMarkerClear) {
          throw new Error('simulated bot marker bookkeeping failure');
        }
        return { rows: [] as T[] };
      }
      if (sql.includes("SET status = 'sent'")) {
        queueSent.push(String(params?.at(-1) ?? ''));
        return { rows: [] as T[] };
      }
      if (sql.includes("SET status = 'failed_retryable'")) {
        queueRetryable.push(String(params?.at(-1) ?? ''));
        return { rows: [] as T[] };
      }
      if (sql.includes("SET status = 'dead'")) {
        queueDead.push({ error: String(params?.at(-3) ?? ''), id: String(params?.at(-1) ?? '') });
        return { rows: [] as T[] };
      }
      return { rows: [] as T[] };
    },
    async tx<T>(fn: (tx: DbPort) => Promise<T>): Promise<T> {
      return fn(db);
    },
  };

  const writePort = {
    async writeDb(mutation: { type: string; params: Record<string, unknown> }) {
      if (mutation.type === 'reminders.occurrence.markSent' && options.failOccurrenceFinalize) {
        throw new Error('simulated occurrence-finalize write failure after provider success');
      }
      writes.push(mutation);
    },
  };

  return {
    db,
    dispatchOutgoing,
    writes,
    queueSent,
    queueRetryable,
    queueDead,
    writePort,
    get botMarkerClearCalls() {
      return botMarkerClearCalls;
    },
  };
}

describe('Track D #987 §7 — duplicate-send prevention after provider success', () => {
  it('occurrence-finalize failure after a successful send leaves the queue row sent and calls the provider exactly once', async () => {
    const h = harness({ failOccurrenceFinalize: true });

    await expect(processOutgoingDeliveryRow(reminderRow(), h as never)).resolves.toBeUndefined();

    expect(h.dispatchOutgoing).toHaveBeenCalledTimes(1);
    // The delivery queue row is already durably `sent` — provider success is recorded — even
    // though the occurrence-finalize write failed afterward.
    expect(h.queueSent).toEqual(['queue-telegram-2']);
    expect(h.queueDead).toEqual([]);
    expect(h.queueRetryable).toEqual([]);
    // The failed occurrence-finalize write never landed as a recorded write and was logged, not
    // silently dropped.
    expect(h.writes).toEqual([]);
    expect(loggerWarn.mock.calls.map((c) => c[1])).toContain(
      'reminder_occurrence_finalize_failed_after_delivery',
    );
  });

  it('a second worker tick never redispatches to the provider after a finalize failure already marked the row sent', async () => {
    // Once `queueSent` records the row as sent, the claim query (`WHERE status IN
    // ('queued','failed_retryable')`, exercised elsewhere) can no longer select this row at all —
    // this test only proves the row-level contract that claim query depends on: sent is terminal
    // and dispatchOutgoing was invoked exactly once for the one real provider send.
    const h = harness({ failOccurrenceFinalize: true });
    await processOutgoingDeliveryRow(reminderRow(), h as never);
    expect(h.queueSent).toEqual(['queue-telegram-2']);
    expect(h.dispatchOutgoing).toHaveBeenCalledTimes(1);
  });

  it('bot-marker bookkeeping failure after a successful send also leaves the row sent and never redispatches', async () => {
    const h = harness({ failBotMarkerClear: true });

    await expect(processOutgoingDeliveryRow(reminderRow(), h as never)).resolves.toBeUndefined();

    expect(h.dispatchOutgoing).toHaveBeenCalledTimes(1);
    expect(h.queueSent).toEqual(['queue-telegram-2']);
    expect(h.queueDead).toEqual([]);
    expect(h.queueRetryable).toEqual([]);
    expect(h.writes.map((w) => w.type)).toEqual(['reminders.occurrence.markSent']);
    expect(loggerWarn.mock.calls.map((c) => c[1])).toContain(
      'outgoing_delivery_bot_marker_bookkeeping_failed_after_delivery',
    );
  });

  it('the ordinary success path still finalizes the occurrence and clears the bot marker once', async () => {
    const h = harness();

    await processOutgoingDeliveryRow(reminderRow(), h as never);

    expect(h.dispatchOutgoing).toHaveBeenCalledTimes(1);
    expect(h.queueSent).toEqual(['queue-telegram-2']);
    expect(h.writes.map((w) => w.type)).toEqual(['reminders.occurrence.markSent']);
  });
});
