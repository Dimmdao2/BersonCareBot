import type { DbPort } from '../../../kernel/contracts/index.js';

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
  await db.query(
    `INSERT INTO projection_outbox (event_type, idempotency_key, occurred_at, payload)
     VALUES ($1, $2, $3, $4::jsonb)`,
    [input.eventType, input.idempotencyKey, input.occurredAt, JSON.stringify(input.payload)],
  );
}

export async function claimDueProjectionEvents(
  db: DbPort,
  limit: number,
): Promise<ProjectionOutboxRow[]> {
  const res = await db.query<ProjectionOutboxRow>(
    `WITH due AS (
       SELECT id FROM projection_outbox
       WHERE status = 'pending' AND next_try_at <= now()
       ORDER BY next_try_at ASC
       LIMIT $1
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
       o.max_attempts AS "maxAttempts"`,
    [Math.max(1, Math.trunc(limit))],
  );
  return res.rows;
}

export async function completeProjectionEvent(db: DbPort, id: number): Promise<void> {
  await db.query(
    `UPDATE projection_outbox SET status = 'done', updated_at = now() WHERE id = $1`,
    [id],
  );
}

export async function failProjectionEvent(db: DbPort, id: number, lastError: string): Promise<void> {
  await db.query(
    `UPDATE projection_outbox SET status = 'dead', last_error = $2, updated_at = now() WHERE id = $1`,
    [id, lastError],
  );
}

export async function rescheduleProjectionEvent(
  db: DbPort,
  id: number,
  attemptsDone: number,
  retryDelaySeconds: number,
): Promise<void> {
  await db.query(
    `UPDATE projection_outbox
     SET status = 'pending',
         attempts_done = $2,
         next_try_at = now() + (($3::text || ' seconds')::interval),
         updated_at = now()
     WHERE id = $1`,
    [id, Math.max(0, attemptsDone), Math.max(1, retryDelaySeconds)],
  );
}
