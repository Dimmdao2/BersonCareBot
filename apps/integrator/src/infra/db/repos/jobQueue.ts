import { and, eq, inArray, sql } from 'drizzle-orm';
import type { DbPort } from '../../../kernel/contracts/index.js';
import { getIntegratorDrizzleSession } from '../drizzle.js';
import { messageRetryJobs } from '../schema/integratorQueues.js';

export type MessageRetryJobRow = {
  id: number;
  phoneNormalized: string | null;
  messageText: string | null;
  kind: string | null;
  runAt: string;
  payloadJson: Record<string, unknown> | null;
  attemptsDone: number;
  maxAttempts: number;
};

export async function enqueueMessageRetryJob(
  db: DbPort,
  input: {
    phoneNormalized: string | null;
    messageText: string | null;
    firstTryDelaySeconds: number;
    /** Prefer an absolute timestamp when the product event has a fixed due time. */
    firstTryAt?: string;
    maxAttempts: number;
    kind: string;
    payloadJson: Record<string, unknown>;
  },
): Promise<void> {
  const d = getIntegratorDrizzleSession(db);
  const delaySec = Math.max(0, Math.trunc(input.firstTryDelaySeconds));
  await d.insert(messageRetryJobs).values({
    phoneNormalized: input.phoneNormalized,
    messageText: input.messageText,
    nextTryAt:
      input.firstTryAt ?? sql`now() + (${String(delaySec)}::text || ' seconds')::interval`,
    attemptsDone: 0,
    maxAttempts: Math.max(1, Math.trunc(input.maxAttempts)),
    status: 'pending',
    kind: input.kind,
    payloadJson: input.payloadJson,
  });
}

/**
 * Claim: CTE + UPDATE … FOR UPDATE SKIP LOCKED — та же семантика, что и legacy SQL, через `execute(sql)`.
 */
export async function claimDueMessageRetryJobs(
  db: DbPort,
  limit: number,
): Promise<MessageRetryJobRow[]> {
  const d = getIntegratorDrizzleSession(db);
  const lim = Math.max(1, Math.trunc(limit));
  const res = await d.execute(sql`
    WITH due AS (
      SELECT id
      FROM integrator.message_retry_jobs
      WHERE status = 'pending'
        AND next_try_at <= now()
      ORDER BY next_try_at ASC
      LIMIT ${lim}
      FOR UPDATE SKIP LOCKED
    )
    UPDATE integrator.message_retry_jobs j
    SET status = 'processing',
        updated_at = now()
    FROM due
    WHERE j.id = due.id
    RETURNING
      j.id,
      j.phone_normalized AS "phoneNormalized",
      j.message_text AS "messageText",
      j.kind,
      j.next_try_at::text AS "runAt",
      j.payload_json AS "payloadJson",
      j.attempts_done AS "attemptsDone",
      j.max_attempts AS "maxAttempts"
  `);
  return res.rows as MessageRetryJobRow[];
}

/**
 * Returns only an expired legacy worker lease to `pending`.
 *
 * `message_retry_jobs` predates the unified queue and has no separate lease column: its
 * `updated_at` is advanced atomically when `claimDueMessageRetryJobs` changes the row to
 * `processing`. Reclaim deliberately preserves `next_try_at`, attempts and the historical
 * payload, so a pre-cutover appointment remains scheduled for its original due time and goes
 * through the compatibility consumer exactly once per successful claim.
 */
export async function reclaimStaleMessageRetryJobProcessing(
  db: DbPort,
  staleAfterMinutes: number,
): Promise<number> {
  const minutes = Math.max(1, Math.trunc(staleAfterMinutes));
  const d = getIntegratorDrizzleSession(db);
  const result = await d.execute(sql`WITH stale AS (
      SELECT id
      FROM integrator.message_retry_jobs
      WHERE status = 'processing'
        AND updated_at < now() - ((${String(minutes)}::text || ' minutes')::interval)
      FOR UPDATE SKIP LOCKED
    )
    UPDATE integrator.message_retry_jobs AS job
    SET status = 'pending',
        updated_at = now()
    FROM stale
    WHERE job.id = stale.id
    RETURNING job.id`);
  return result.rows.length;
}

export async function rescheduleMessageRetryJob(
  db: DbPort,
  input: {
    id: number;
    attemptsDone: number;
    retryDelaySeconds: number;
    lastError?: string;
  },
): Promise<void> {
  const d = getIntegratorDrizzleSession(db);
  const delay = Math.max(1, Math.trunc(input.retryDelaySeconds));
  const attempts = Math.max(0, Math.trunc(input.attemptsDone));
  await d
    .update(messageRetryJobs)
    .set({
      status: 'pending',
      attemptsDone: attempts,
      nextTryAt: sql`now() + (${String(delay)}::text || ' seconds')::interval`,
      lastError: input.lastError ?? null,
      updatedAt: sql`now()`,
    })
    .where(eq(messageRetryJobs.id, input.id));
}

export async function completeMessageRetryJob(db: DbPort, id: number): Promise<void> {
  const d = getIntegratorDrizzleSession(db);
  await d
    .update(messageRetryJobs)
    .set({ status: 'done', updatedAt: sql`now()` })
    .where(eq(messageRetryJobs.id, id));
}

export async function failMessageRetryJob(
  db: DbPort,
  input: { id: number; lastError?: string },
): Promise<void> {
  const d = getIntegratorDrizzleSession(db);
  await d
    .update(messageRetryJobs)
    .set({
      status: 'dead',
      lastError: input.lastError ?? null,
      updatedAt: sql`now()`,
    })
    .where(eq(messageRetryJobs.id, input.id));
}

/**
 * Отмена напоминаний по записи: те же фильтры, что и legacy `UPDATE … WHERE payload_json->'booking'->>'bookingId'`.
 */
export async function cancelPendingBookingReminderJobsByBookingId(
  db: DbPort,
  bookingId: string,
): Promise<void> {
  const d = getIntegratorDrizzleSession(db);
  await d
    .update(messageRetryJobs)
    .set({
      status: 'dead',
      lastError: 'booking_cancelled',
      updatedAt: sql`now()`,
    })
    .where(
      and(
        inArray(messageRetryJobs.status, ['pending', 'processing']),
        eq(messageRetryJobs.kind, 'message.deliver'),
        sql`${messageRetryJobs.payloadJson}->'booking'->>'bookingId' = ${bookingId}`,
      ),
    );
}
