import { sql } from 'drizzle-orm';
import { getCurrentCorrelationId } from '@bersoncare/db-principal';
import type { DbPort } from '../../../kernel/contracts/index.js';
import type { OutgoingDeliveryKind } from '../../delivery/deliveryContract.js';
import { runIntegratorSql } from '../runIntegratorSql.js';
import { getOutgoingDeliveryReclaimConfig } from './outgoingDeliveryReclaimSettings.js';

export type OutgoingDeliveryQueueRow = {
  id: string;
  eventId: string;
  kind: string;
  channel: string;
  payloadJson: Record<string, unknown>;
  status: string;
  attemptCount: number;
  maxAttempts: number;
  nextRetryAt: string;
  lastAttemptAt: string | null;
  sentAt: string | null;
  deadAt: string | null;
  lastError: string | null;
  /** Claim-order tiebreaker (migration 0359); optional so existing row fixtures need no touch-up. */
  priority?: number;
};

export type EnqueueOutgoingDeliveryInput = {
  eventId: string;
  kind: OutgoingDeliveryKind;
  channel: string;
  payloadJson: Record<string, unknown>;
  maxAttempts?: number;
  /** Absolute first-attempt time. Omitted means the row is due immediately. */
  nextRetryAt?: string;
};

/** Copies only the bounded ambient correlation UUID into the queue's existing intent metadata. */
export function attachCurrentCorrelationToOutgoingPayload(
  payloadJson: Record<string, unknown>,
): Record<string, unknown> {
  const correlationId = getCurrentCorrelationId();
  if (correlationId === undefined) return payloadJson;
  const intent = payloadJson.intent;
  if (intent === null || typeof intent !== 'object') return payloadJson;
  const intentRecord = intent as Record<string, unknown>;
  const meta = intentRecord.meta;
  if (meta === null || typeof meta !== 'object') return payloadJson;
  return {
    ...payloadJson,
    intent: {
      ...intentRecord,
      meta: {
        ...(meta as Record<string, unknown>),
        correlationId,
      },
    },
  };
}

/**
 * Вставка в очередь; при конфликте `event_id` — без ошибки (idempotency).
 * @returns true если вставлена новая строка
 */
export async function enqueueOutgoingDeliveryIfAbsent(
  db: DbPort,
  input: EnqueueOutgoingDeliveryInput,
): Promise<boolean> {
  const maxAttempts = Math.max(1, Math.trunc(input.maxAttempts ?? 6));
  const payloadJson = attachCurrentCorrelationToOutgoingPayload(input.payloadJson);
  const res = await runIntegratorSql<{ inserted: boolean }>(
    db,
    sql`INSERT INTO public.outgoing_delivery_queue (
       event_id,
       kind,
       channel,
       payload_json,
       status,
       attempt_count,
       max_attempts,
       next_retry_at
     ) VALUES (
       ${input.eventId},
       ${input.kind},
       ${input.channel},
       ${JSON.stringify(payloadJson)}::jsonb,
       'pending',
       0,
       ${maxAttempts},
       COALESCE(${input.nextRetryAt ?? null}::timestamptz, now())
     )
     ON CONFLICT (event_id) DO NOTHING
     RETURNING true AS inserted`,
  );
  // Retention belongs to the producer boundary deliberately: every successful queue producer
  // already needs app_staff INSERT, and that same existing role owns DELETE. The delivery worker
  // has only SELECT/UPDATE, so invoking retention from its tick would fail in locked runtime.
  const retention = await getOutgoingDeliveryReclaimConfig(db);
  await deleteExpiredSentOutgoingDeliveries(db, retention.doneRetentionDays);
  return Boolean(res.rows[0]?.inserted);
}

export type ReclaimStaleOutgoingDeliveryProcessingResult = {
  /** Rows returned to "pending" (still under the reclaim cap). */
  reclaimed: number;
  /** Rows that hit the reclaim cap and were sent to the dead letter instead. */
  deadLettered: number;
};

/** failure_class set when a row is dead-lettered for exceeding the reclaim cap (D10b), not a delivery error. */
export const OUTGOING_DELIVERY_RECLAIM_LIMIT_FAILURE_CLASS = 'reclaim_limit_exceeded';

/**
 * D10b: a "processing" row not finished within `staleAfterMinutes` is stuck (the worker that
 * claimed it died mid-flight) — normal capture only picks up "pending"/"failed_retryable", so
 * without this it would never be retried again. Returned to "pending" so the next capture picks
 * it back up, unless it has already been reclaimed `maxReclaimCount` times, in which case it goes
 * to the dead letter (`status = 'dead'`) instead of looping forever.
 */
export async function resetStaleOutgoingDeliveryProcessing(
  db: DbPort,
  staleAfterMinutes: number,
  maxReclaimCount: number,
): Promise<ReclaimStaleOutgoingDeliveryProcessingResult> {
  const m = Math.max(1, Math.trunc(staleAfterMinutes));
  const cap = Math.max(1, Math.trunc(maxReclaimCount));
  const res = await runIntegratorSql<{ status: string }>(
    db,
    sql`WITH stale AS (
       SELECT id
       FROM public.outgoing_delivery_queue
       WHERE status = 'processing'
         AND last_attempt_at IS NOT NULL
         AND last_attempt_at < now() - ((${String(m)}::text || ' minutes')::interval)
       FOR UPDATE SKIP LOCKED
     )
     UPDATE public.outgoing_delivery_queue q
     SET reclaim_count = q.reclaim_count + 1,
         status = CASE WHEN q.reclaim_count + 1 >= ${cap} THEN 'dead' ELSE 'pending' END,
         next_retry_at = CASE
           WHEN q.reclaim_count + 1 >= ${cap} THEN q.next_retry_at
           ELSE now()
         END,
         dead_at = CASE WHEN q.reclaim_count + 1 >= ${cap} THEN now() ELSE q.dead_at END,
         failure_class = CASE
           WHEN q.reclaim_count + 1 >= ${cap} THEN ${OUTGOING_DELIVERY_RECLAIM_LIMIT_FAILURE_CLASS}
           ELSE q.failure_class
         END,
         last_error = CASE
           WHEN q.reclaim_count + 1 >= ${cap}
             THEN 'OUTGOING_DELIVERY_RECLAIM_LIMIT_EXCEEDED'
           ELSE q.last_error
         END,
         updated_at = now()
     FROM stale
     WHERE q.id = stale.id
     RETURNING q.status`,
  );
  let reclaimed = 0;
  let deadLettered = 0;
  for (const row of res.rows) {
    if (row.status === 'dead') deadLettered += 1;
    else reclaimed += 1;
  }
  return { reclaimed, deadLettered };
}

/**
 * D10b: "sent" rows accumulate forever without this (found growing unbounded since March 5 on
 * dev). Only the queue's working row is removed — `public.notification_delivery_attempts` keeps
 * the durable delivery history and is never touched here.
 */
export async function deleteExpiredSentOutgoingDeliveries(
  db: DbPort,
  retentionDays: number,
): Promise<number> {
  const d = Math.max(1, Math.trunc(retentionDays));
  const res = await runIntegratorSql<{ id: string }>(
    db,
    sql`DELETE FROM public.outgoing_delivery_queue
     WHERE status = 'sent'
       AND sent_at IS NOT NULL
       AND NOT (
         kind = 'specialist_task_reminder'
         AND payload_json ? 'successOutcome'
         AND payload_json #>> '{successOutcome,appliedAt}' IS NULL
       )
       AND NOT (
         kind = 'specialist_task_reminder'
         AND payload_json #>> '{bookkeeping,botMarkerRequired}' = 'true'
         AND payload_json #>> '{bookkeeping,botMarkerAppliedAt}' IS NULL
       )
       AND sent_at < now() - ((${String(d)}::text || ' days')::interval)
     RETURNING id`,
  );
  return res.rows.length;
}

export async function claimDueOutgoingDeliveries(
  db: DbPort,
  limit: number,
): Promise<OutgoingDeliveryQueueRow[]> {
  const lim = Math.max(1, Math.trunc(limit));
  const res = await runIntegratorSql<{
    id: string;
    event_id: string;
    kind: string;
    channel: string;
    payload_json: Record<string, unknown>;
    status: string;
    attempt_count: number;
    max_attempts: number;
    next_retry_at: string;
    last_attempt_at: string | null;
    sent_at: string | null;
    dead_at: string | null;
    last_error: string | null;
    priority: number;
  }>(
    db,
    sql`WITH due AS (
       SELECT id
       FROM public.outgoing_delivery_queue
       WHERE status IN ('pending', 'failed_retryable')
         AND next_retry_at <= now()
       ORDER BY priority DESC, next_retry_at ASC
       LIMIT ${lim}
       FOR UPDATE SKIP LOCKED
     )
     UPDATE public.outgoing_delivery_queue q
     SET status = 'processing',
         attempt_count = q.attempt_count + 1,
         last_attempt_at = now(),
         updated_at = now()
     FROM due
     WHERE q.id = due.id
     RETURNING
       q.id,
       q.event_id,
       q.kind,
       q.channel,
       q.payload_json,
       q.status,
       q.attempt_count,
       q.max_attempts,
       q.next_retry_at::text,
       q.last_attempt_at::text,
       q.sent_at::text,
       q.dead_at::text,
       q.last_error,
       q.priority`,
  );
  return res.rows.map((r) => ({
    id: r.id,
    eventId: r.event_id,
    kind: r.kind,
    channel: r.channel,
    payloadJson: r.payload_json ?? {},
    status: r.status,
    attemptCount: r.attempt_count,
    maxAttempts: r.max_attempts,
    nextRetryAt: r.next_retry_at,
    lastAttemptAt: r.last_attempt_at,
    sentAt: r.sent_at,
    deadAt: r.dead_at,
    lastError: r.last_error,
    priority: r.priority ?? 0,
  }));
}

export async function markOutgoingDeliverySent(db: DbPort, id: string): Promise<void> {
  await runIntegratorSql(
    db,
    sql`UPDATE public.outgoing_delivery_queue
     SET status = 'sent',
         sent_at = now(),
         updated_at = now(),
         last_error = NULL
     WHERE id = ${id}
       AND status = 'processing'`,
  );
}

/** Sent transport rows whose product receipt still needs applying; never claimed for dispatch again. */
export async function listPendingSpecialistTaskReminderOutcomes(
  db: DbPort,
  limit: number,
): Promise<string[]> {
  const lim = Math.max(1, Math.trunc(limit));
  const result = await runIntegratorSql<{ id: string }>(
    db,
    sql`SELECT id
        FROM public.outgoing_delivery_queue
        WHERE status = 'sent'
          AND kind = 'specialist_task_reminder'
          AND payload_json ? 'successOutcome'
          AND payload_json #>> '{successOutcome,appliedAt}' IS NULL
        ORDER BY sent_at ASC
        LIMIT ${lim}`,
  );
  return result.rows.map((row) => row.id);
}

/** Sent messenger deliveries whose non-transport bot-marker cleanup still needs retrying. */
export async function listPendingSpecialistTaskReminderBotMarkers(
  db: DbPort,
  limit: number,
): Promise<OutgoingDeliveryQueueRow[]> {
  const lim = Math.max(1, Math.trunc(limit));
  const result = await runIntegratorSql<{
    id: string;
    event_id: string;
    kind: string;
    channel: string;
    payload_json: Record<string, unknown>;
    status: string;
    attempt_count: number;
    max_attempts: number;
    next_retry_at: string;
    last_attempt_at: string | null;
    sent_at: string | null;
    dead_at: string | null;
    last_error: string | null;
    priority: number;
  }>(
    db,
    sql`SELECT id, event_id, kind, channel, payload_json, status,
               attempt_count, max_attempts, next_retry_at::text,
               last_attempt_at::text, sent_at::text, dead_at::text, last_error, priority
        FROM public.outgoing_delivery_queue
        WHERE status = 'sent'
          AND kind = 'specialist_task_reminder'
          AND payload_json #>> '{bookkeeping,botMarkerRequired}' = 'true'
          AND payload_json #>> '{bookkeeping,botMarkerAppliedAt}' IS NULL
        ORDER BY sent_at ASC
        LIMIT ${lim}`,
  );
  return result.rows.map((row) => ({
    id: row.id,
    eventId: row.event_id,
    kind: row.kind,
    channel: row.channel,
    payloadJson: row.payload_json ?? {},
    status: row.status,
    attemptCount: row.attempt_count,
    maxAttempts: row.max_attempts,
    nextRetryAt: row.next_retry_at,
    lastAttemptAt: row.last_attempt_at,
    sentAt: row.sent_at,
    deadAt: row.dead_at,
    lastError: row.last_error,
    priority: row.priority ?? 0,
  }));
}

export async function markSpecialistTaskReminderBotMarkerApplied(
  db: DbPort,
  queueId: string,
): Promise<void> {
  await runIntegratorSql(
    db,
    sql`UPDATE public.outgoing_delivery_queue
        SET payload_json = jsonb_set(
              payload_json,
              '{bookkeeping,botMarkerAppliedAt}',
              to_jsonb(clock_timestamp()::text),
              true
            ),
            updated_at = clock_timestamp()
        WHERE id = ${queueId}::uuid
          AND status = 'sent'
          AND kind = 'specialist_task_reminder'
          AND payload_json #>> '{bookkeeping,botMarkerRequired}' = 'true'
          AND payload_json #>> '{bookkeeping,botMarkerAppliedAt}' IS NULL`,
  );
}

export async function markOutgoingDeliveryDead(
  db: DbPort,
  id: string,
  lastError: string | null,
  failureClass?: string | null,
): Promise<void> {
  await runIntegratorSql(
    db,
    sql`UPDATE public.outgoing_delivery_queue
     SET status = 'dead',
         dead_at = now(),
         updated_at = now(),
         last_error = ${lastError},
         failure_class = ${failureClass ?? null}
     WHERE id = ${id}
       AND status = 'processing'`,
  );
}

export async function rescheduleOutgoingDeliveryRetry(
  db: DbPort,
  id: string,
  delaySeconds: number,
  lastError: string | null,
): Promise<void> {
  const sec = Math.max(1, Math.trunc(delaySeconds));
  await runIntegratorSql(
    db,
    sql`UPDATE public.outgoing_delivery_queue
     SET status = 'failed_retryable',
         next_retry_at = now() + ((${String(sec)}::text || ' seconds')::interval),
         updated_at = now(),
         last_error = ${lastError}
     WHERE id = ${id}
       AND status = 'processing'`,
  );
}
