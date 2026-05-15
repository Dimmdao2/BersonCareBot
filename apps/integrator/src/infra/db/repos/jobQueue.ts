import { eq, sql } from 'drizzle-orm';
import type { DbPort } from '../../../kernel/contracts/index.js';
import { getIntegratorDrizzleSession } from '../drizzle.js';
import { rubitimeCreateRetryJobs } from '../schema/integratorQueues.js';

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

export async function enqueueMessageRetryJob(db: DbPort, input: {
  phoneNormalized: string | null;
  messageText: string | null;
  firstTryDelaySeconds: number;
  maxAttempts: number;
  kind: string;
  payloadJson: Record<string, unknown>;
}): Promise<void> {
  const d = getIntegratorDrizzleSession(db);
  const delaySec = Math.max(0, Math.trunc(input.firstTryDelaySeconds));
  await d.insert(rubitimeCreateRetryJobs).values({
    phoneNormalized: input.phoneNormalized,
    messageText: input.messageText,
    nextTryAt: sql`now() + (${String(delaySec)}::text || ' seconds')::interval`,
    attemptsDone: 0,
    maxAttempts: Math.max(1, Math.trunc(input.maxAttempts)),
    status: 'pending',
    kind: input.kind,
    payloadJson: input.payloadJson,
  });
}

/**
 * Claim: CTE + UPDATE … FOR UPDATE SKIP LOCKED — идентичный legacy SQL, `execute(sql)`.
 */
export async function claimDueMessageRetryJobs(db: DbPort, limit: number): Promise<MessageRetryJobRow[]> {
  const d = getIntegratorDrizzleSession(db);
  const lim = Math.max(1, Math.trunc(limit));
  const res = await d.execute(sql`
    WITH due AS (
      SELECT id
      FROM rubitime_create_retry_jobs
      WHERE status = 'pending'
        AND next_try_at <= now()
      ORDER BY next_try_at ASC
      LIMIT ${lim}
      FOR UPDATE SKIP LOCKED
    )
    UPDATE rubitime_create_retry_jobs j
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

export async function rescheduleMessageRetryJob(db: DbPort, input: {
  id: number;
  attemptsDone: number;
  retryDelaySeconds: number;
  lastError?: string;
}): Promise<void> {
  const d = getIntegratorDrizzleSession(db);
  const delay = Math.max(1, Math.trunc(input.retryDelaySeconds));
  const attempts = Math.max(0, Math.trunc(input.attemptsDone));
  await d
    .update(rubitimeCreateRetryJobs)
    .set({
      status: 'pending',
      attemptsDone: attempts,
      nextTryAt: sql`now() + (${String(delay)}::text || ' seconds')::interval`,
      lastError: input.lastError ?? null,
      updatedAt: sql`now()`,
    })
    .where(eq(rubitimeCreateRetryJobs.id, input.id));
}

export async function completeMessageRetryJob(db: DbPort, id: number): Promise<void> {
  const d = getIntegratorDrizzleSession(db);
  await d
    .update(rubitimeCreateRetryJobs)
    .set({ status: 'done', updatedAt: sql`now()` })
    .where(eq(rubitimeCreateRetryJobs.id, id));
}

export async function failMessageRetryJob(db: DbPort, input: { id: number; lastError?: string }): Promise<void> {
  const d = getIntegratorDrizzleSession(db);
  await d
    .update(rubitimeCreateRetryJobs)
    .set({
      status: 'dead',
      lastError: input.lastError ?? null,
      updatedAt: sql`now()`,
    })
    .where(eq(rubitimeCreateRetryJobs.id, input.id));
}
