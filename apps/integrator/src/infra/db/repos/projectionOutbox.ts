import { eq, sql } from 'drizzle-orm';
import type { DbPort } from '../../../kernel/contracts/index.js';
import { getIntegratorDrizzleSession } from '../drizzle.js';
import { projectionOutbox } from '../schema/integratorQueues.js';

export type ProjectionOutboxRow = {
  id: number;
  eventType: string;
  idempotencyKey: string;
  occurredAt: string;
  payload: Record<string, unknown>;
  attemptsDone: number;
  maxAttempts: number;
};

export async function enqueueProjectionEvent(
  db: DbPort,
  input: {
    eventType: string;
    idempotencyKey: string;
    occurredAt: string;
    payload: Record<string, unknown>;
  },
): Promise<void> {
  const d = getIntegratorDrizzleSession(db);
  await d
    .insert(projectionOutbox)
    .values({
      eventType: input.eventType,
      idempotencyKey: input.idempotencyKey,
      occurredAt: input.occurredAt,
      payload: input.payload,
    })
    .onConflictDoNothing({ target: projectionOutbox.idempotencyKey });
}

/**
 * Claim: один statement CTE + UPDATE … FOR UPDATE SKIP LOCKED (как legacy SQL).
 * Оставлено через `execute(sql\`…\`)` — см. план этапа 2.
 */
export async function claimDueProjectionEvents(
  db: DbPort,
  limit: number,
): Promise<ProjectionOutboxRow[]> {
  const d = getIntegratorDrizzleSession(db);
  const lim = Math.max(1, Math.trunc(limit));
  const res = await d.execute(sql`
    WITH due AS (
       SELECT id FROM projection_outbox
       WHERE status = 'pending' AND next_try_at <= now()
       ORDER BY next_try_at ASC
       LIMIT ${lim}
       FOR UPDATE SKIP LOCKED
     )
     UPDATE projection_outbox o
     SET status = 'processing', updated_at = now()
     FROM due WHERE o.id = due.id
     RETURNING
       o.id,
       o.event_type AS "eventType",
       o.idempotency_key AS "idempotencyKey",
       o.occurred_at::text AS "occurredAt",
       o.payload,
       o.attempts_done AS "attemptsDone",
       o.max_attempts AS "maxAttempts"
  `);
  return res.rows as ProjectionOutboxRow[];
}

export async function completeProjectionEvent(db: DbPort, id: number): Promise<void> {
  const d = getIntegratorDrizzleSession(db);
  await d
    .update(projectionOutbox)
    .set({ status: 'done', updatedAt: sql`now()` })
    .where(eq(projectionOutbox.id, id));
}

export async function failProjectionEvent(db: DbPort, id: number, lastError: string): Promise<void> {
  const d = getIntegratorDrizzleSession(db);
  await d
    .update(projectionOutbox)
    .set({ status: 'dead', lastError, updatedAt: sql`now()` })
    .where(eq(projectionOutbox.id, id));
}

export async function rescheduleProjectionEvent(
  db: DbPort,
  id: number,
  attemptsDone: number,
  retryDelaySeconds: number,
): Promise<void> {
  const d = getIntegratorDrizzleSession(db);
  const delay = Math.max(1, retryDelaySeconds);
  const attempts = Math.max(0, attemptsDone);
  await d
    .update(projectionOutbox)
    .set({
      status: 'pending',
      attemptsDone: attempts,
      nextTryAt: sql`now() + (${String(delay)}::text || ' seconds')::interval`,
      updatedAt: sql`now()`,
    })
    .where(eq(projectionOutbox.id, id));
}
