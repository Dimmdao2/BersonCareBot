import { db } from '../client.js';

export type RubitimeCreateRetryJobRow = {
  id: number;
  phoneNormalized: string;
  messageText: string;
  attemptsDone: number;
  maxAttempts: number;
};

export async function enqueueRubitimeCreateRetryJob(input: {
  phoneNormalized: string;
  messageText: string;
  firstTryDelaySeconds: number;
  maxAttempts: number;
}): Promise<void> {
  const query = `
    INSERT INTO rubitime_create_retry_jobs (
      phone_normalized,
      message_text,
      next_try_at,
      attempts_done,
      max_attempts,
      status
    ) VALUES (
      $1,
      $2,
      now() + (($3::text || ' seconds')::interval),
      0,
      $4,
      'pending'
    )
  `;
  await db.query(query, [
    input.phoneNormalized,
    input.messageText,
    Math.max(0, Math.trunc(input.firstTryDelaySeconds)),
    Math.max(1, Math.trunc(input.maxAttempts)),
  ]);
}

export async function claimDueRubitimeCreateRetryJobs(limit: number): Promise<RubitimeCreateRetryJobRow[]> {
  const query = `
    WITH due AS (
      SELECT id
      FROM rubitime_create_retry_jobs
      WHERE status = 'pending'
        AND next_try_at <= now()
      ORDER BY next_try_at ASC
      LIMIT $1
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
      j.attempts_done AS "attemptsDone",
      j.max_attempts AS "maxAttempts"
  `;
  const res = await db.query<RubitimeCreateRetryJobRow>(query, [Math.max(1, Math.trunc(limit))]);
  return res.rows;
}

export async function rescheduleRubitimeCreateRetryJob(input: {
  id: number;
  attemptsDone: number;
  retryDelaySeconds: number;
  lastError?: string;
}): Promise<void> {
  const query = `
    UPDATE rubitime_create_retry_jobs
    SET status = 'pending',
        attempts_done = $2,
        next_try_at = now() + (($3::text || ' seconds')::interval),
        last_error = $4,
        updated_at = now()
    WHERE id = $1
  `;
  await db.query(query, [
    input.id,
    Math.max(0, Math.trunc(input.attemptsDone)),
    Math.max(1, Math.trunc(input.retryDelaySeconds)),
    input.lastError ?? null,
  ]);
}

export async function completeRubitimeCreateRetryJob(id: number): Promise<void> {
  const query = `
    UPDATE rubitime_create_retry_jobs
    SET status = 'done',
        updated_at = now()
    WHERE id = $1
  `;
  await db.query(query, [id]);
}
