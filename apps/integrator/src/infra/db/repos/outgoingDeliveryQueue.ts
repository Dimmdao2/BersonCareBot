import type { DbPort } from '../../../kernel/contracts/index.js';
import type { OutgoingDeliveryKind } from '../../delivery/deliveryContract.js';

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
};

export type EnqueueOutgoingDeliveryInput = {
  eventId: string;
  kind: OutgoingDeliveryKind;
  channel: string;
  payloadJson: Record<string, unknown>;
  maxAttempts?: number;
};

/**
 * Вставка в очередь; при конфликте `event_id` — без ошибки (idempotency).
 * @returns true если вставлена новая строка
 */
export async function enqueueOutgoingDeliveryIfAbsent(
  db: DbPort,
  input: EnqueueOutgoingDeliveryInput,
): Promise<boolean> {
  const maxAttempts = Math.max(1, Math.trunc(input.maxAttempts ?? 6));
  const res = await db.query<{ inserted: boolean }>(
    `INSERT INTO public.outgoing_delivery_queue (
       event_id,
       kind,
       channel,
       payload_json,
       status,
       attempt_count,
       max_attempts,
       next_retry_at
     ) VALUES ($1, $2, $3, $4::jsonb, 'pending', 0, $5, now())
     ON CONFLICT (event_id) DO NOTHING
     RETURNING true AS inserted`,
    [input.eventId, input.kind, input.channel, JSON.stringify(input.payloadJson), maxAttempts],
  );
  return Boolean(res.rows[0]?.inserted);
}

export async function resetStaleOutgoingDeliveryProcessing(
  db: DbPort,
  staleAfterMinutes = 10,
): Promise<number> {
  const m = Math.max(1, Math.trunc(staleAfterMinutes));
  const res = await db.query<{ id: string }>(
    `UPDATE public.outgoing_delivery_queue
     SET status = 'failed_retryable',
         next_retry_at = now(),
         updated_at = now()
     WHERE status = 'processing'
       AND last_attempt_at IS NOT NULL
       AND last_attempt_at < now() - (($1::text || ' minutes')::interval)
     RETURNING id`,
    [String(m)],
  );
  return res.rows.length;
}

export async function claimDueOutgoingDeliveries(db: DbPort, limit: number): Promise<OutgoingDeliveryQueueRow[]> {
  const lim = Math.max(1, Math.trunc(limit));
  const res = await db.query<{
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
  }>(
    `WITH due AS (
       SELECT id
       FROM public.outgoing_delivery_queue
       WHERE status IN ('pending', 'failed_retryable')
         AND next_retry_at <= now()
       ORDER BY next_retry_at ASC
       LIMIT $1
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
       q.last_error`,
    [lim],
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
  }));
}

export async function markOutgoingDeliverySent(db: DbPort, id: string): Promise<void> {
  await db.query(
    `UPDATE public.outgoing_delivery_queue
     SET status = 'sent',
         sent_at = now(),
         updated_at = now(),
         last_error = NULL
     WHERE id = $1`,
    [id],
  );
}

export async function markOutgoingDeliveryDead(db: DbPort, id: string, lastError: string | null): Promise<void> {
  await db.query(
    `UPDATE public.outgoing_delivery_queue
     SET status = 'dead',
         dead_at = now(),
         updated_at = now(),
         last_error = $2
     WHERE id = $1`,
    [id, lastError],
  );
}

export async function rescheduleOutgoingDeliveryRetry(
  db: DbPort,
  id: string,
  delaySeconds: number,
  lastError: string | null,
): Promise<void> {
  const sec = Math.max(1, Math.trunc(delaySeconds));
  await db.query(
    `UPDATE public.outgoing_delivery_queue
     SET status = 'failed_retryable',
         next_retry_at = now() + (($1::text || ' seconds')::interval),
         updated_at = now(),
         last_error = $2
     WHERE id = $3`,
    [String(sec), lastError, id],
  );
}
