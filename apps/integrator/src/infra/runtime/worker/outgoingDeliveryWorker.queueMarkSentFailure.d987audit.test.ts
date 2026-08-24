/**
 * Track D final cutover (#987) — independent audit acceptance test (auditor-live, D987-F1).
 *
 * Owner oracle for this surface: "Real provider failure records an attempt and retry time. Provider
 * success marks delivery sent. A LATER BOOKKEEPING FAILURE MUST NOT CAUSE A SECOND PROVIDER SEND."
 *
 * `50794b541` closed that hole for two of the three post-acceptance writes: occurrence-finalization
 * and the bot-marker clear now run after `queueMarkSent`, each in its own logging-only try/catch
 * (proved by `outgoingDeliveryWorker.duplicateSendPrevention.d987.test.ts`). `queueMarkSent` itself
 * was deliberately left INSIDE the provider try/catch, on the reasoning that "the queue row IS the
 * delivery". But it is still a database write that happens strictly AFTER `dispatchOutgoing` has
 * returned, i.e. after a real Telegram/MAX/email/web-push message has already reached the patient:
 *
 *   dispatchOutgoing(intent)   -> provider ACCEPTED, patient already has the message
 *   queueMarkSent(db, row.id)  -> throws (connection reset, deadlock, 42501, statement timeout)
 *   catch                      -> handleDispatchFailure(...)
 *                                   -> recordDeliveryFailureAttempt(status:'failed')  [false attempt]
 *                                   -> isOutgoingDeliveryDispatchErrorRetryable(...) === true for any
 *                                      message that is not one of the eight hard-coded config codes,
 *                                      so a DB error is classified retryable
 *                                   -> queueReschedule(...) -> status 'failed_retryable'
 *   next tick                  -> row is claimed again; the occurrence is still 'queued' (markSent
 *                                 never ran), and app.revalidate_patient_reminder_delivery_materialization
 *                                 accepts `occurrence.status IN ('queued','sent')`, so nothing stops it
 *                                   -> dispatchOutgoing(intent) AGAIN -> patient gets a SECOND message.
 *
 * This test drives exactly that two-tick sequence and asserts the three properties the oracle
 * requires. It is RED on `50794b541`: the provider is called twice, a provider-failure attempt is
 * recorded for a send that actually succeeded, and the row is rescheduled instead of terminal.
 */
import { describe, expect, it, vi } from 'vitest';
import type { DbPort, DbQueryResult, DeliverySendResult, OutgoingIntent } from '../../../kernel/contracts/index.js';
import type { OutgoingDeliveryQueueRow } from '../../db/repos/outgoingDeliveryQueue.js';
import { processOutgoingDeliveryRow } from './outgoingDeliveryWorker.js';

vi.mock('../../observability/logger.js', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    logger: { ...(actual.logger as object), warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
  };
});

const OCCURRENCE_ID = 'd987-f1-occurrence';

function reminderRow(overrides: Partial<OutgoingDeliveryQueueRow> = {}): OutgoingDeliveryQueueRow {
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
      message: { text: 'Напоминание' },
      delivery: { channels: ['telegram'] },
    },
  };
  return {
    id: 'queue-telegram-f1',
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
      logText: 'Напоминание',
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
    ...overrides,
  };
}

/** One shared harness across both ticks: the provider counter must survive the reschedule. */
function harness() {
  const dispatchOutgoing = vi.fn(
    async (): Promise<DeliverySendResult> => ({ telegramMessageId: 7 }),
  );
  const queueSent: string[] = [];
  const queueRetryable: string[] = [];
  const queueDead: string[] = [];
  const attemptLog: Array<{ status: unknown; reason: unknown }> = [];
  let markSentFailuresLeft = 1;

  const db: DbPort = {
    async query<T>(sql: string, params?: unknown[]): Promise<DbQueryResult<T>> {
      if (sql.includes('revalidate_patient_reminder_delivery_materialization')) {
        return { rows: [{ current: true }] as T[] };
      }
      if (sql.includes('organization_id') && sql.includes('reminder_occurrence_history')) {
        return { rows: [{ organization_id: 'd0000000-0000-4000-8000-00000000000d' }] as T[] };
      }
      if (sql.includes("SET status = 'sent'")) {
        if (markSentFailuresLeft > 0) {
          markSentFailuresLeft -= 1;
          // The provider has already accepted at this point — this is a post-acceptance
          // bookkeeping write, not a delivery failure.
          throw new Error('connection terminated unexpectedly');
        }
        queueSent.push(String(params?.at(-1) ?? ''));
        return { rows: [] as T[] };
      }
      if (sql.includes("SET status = 'failed_retryable'")) {
        queueRetryable.push(String(params?.at(-1) ?? ''));
        return { rows: [] as T[] };
      }
      if (sql.includes("SET status = 'dead'")) {
        queueDead.push(String(params?.at(-1) ?? ''));
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
      if (mutation.type === 'delivery.attempt.log') {
        attemptLog.push({ status: mutation.params.status, reason: mutation.params.reason });
      }
    },
  };

  return { db, writePort, dispatchOutgoing, queueSent, queueRetryable, queueDead, attemptLog };
}

describe('Track D #987 D987-F1 — a failed post-acceptance queue write must not re-send to the provider', () => {
  it('never calls the provider a second time when marking the queue row sent fails after acceptance', async () => {
    const h = harness();

    // Tick 1: provider accepts, then the `status = 'sent'` write fails.
    await processOutgoingDeliveryRow(reminderRow(), h as never);
    // Tick 2: whatever the worker did with the row, the next tick must not produce a second send.
    await processOutgoingDeliveryRow(reminderRow({ attemptCount: 2 }), h as never);

    // The patient must receive exactly one message. Today: 2.
    expect(h.dispatchOutgoing).toHaveBeenCalledTimes(1);
  });

  it('does not record a provider-failure attempt for a send the provider accepted', async () => {
    const h = harness();

    await processOutgoingDeliveryRow(reminderRow(), h as never);

    // `recordDeliveryFailureAttempt` writes status:'failed' into the attempt journal. The provider
    // did not fail — only our own bookkeeping did — so no failed attempt may be recorded.
    expect(h.attemptLog.filter((entry) => entry.status === 'failed')).toEqual([]);
  });

  it('does not reschedule an already-delivered row back onto the provider path', async () => {
    const h = harness();

    await processOutgoingDeliveryRow(reminderRow(), h as never);

    // 'failed_retryable' is exactly the status `claimDueOutgoingDeliveries` picks up again.
    expect(h.queueRetryable).toEqual([]);
  });
});
