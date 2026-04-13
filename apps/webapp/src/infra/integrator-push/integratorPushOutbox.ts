import type { Pool, PoolClient } from "pg";

export const INTEGRATOR_PUSH_KINDS = ["system_settings_sync", "reminder_rule_upsert"] as const;
export type IntegratorPushKind = (typeof INTEGRATOR_PUSH_KINDS)[number];

export type IntegratorPushOutboxRow = {
  id: string;
  kind: IntegratorPushKind;
  idempotencyKey: string;
  payload: Record<string, unknown>;
  attemptsDone: number;
  maxAttempts: number;
};

function isKind(k: string): k is IntegratorPushKind {
  return (INTEGRATOR_PUSH_KINDS as readonly string[]).includes(k);
}

/**
 * Insert or refresh payload and reset retry state (latest value wins for same idempotency key).
 */
export async function enqueueIntegratorPush(
  db: Pool | PoolClient,
  input: { kind: IntegratorPushKind; idempotencyKey: string; payload: Record<string, unknown> },
): Promise<void> {
  await db.query(
    `INSERT INTO integrator_push_outbox (kind, idempotency_key, payload, status, next_try_at)
     VALUES ($1, $2, $3::jsonb, 'pending', now())
     ON CONFLICT (idempotency_key) DO UPDATE SET
       kind = EXCLUDED.kind,
       payload = EXCLUDED.payload,
       status = 'pending',
       attempts_done = 0,
       next_try_at = now(),
       last_error = NULL,
       updated_at = now()`,
    [input.kind, input.idempotencyKey, JSON.stringify(input.payload)],
  );
}

export async function claimDueIntegratorPushJobs(
  db: Pool | PoolClient,
  limit: number,
): Promise<IntegratorPushOutboxRow[]> {
  const res = await db.query<{
    id: string;
    kind: string;
    idempotency_key: string;
    payload: Record<string, unknown>;
    attempts_done: number;
    max_attempts: number;
  }>(
    `WITH due AS (
       SELECT id FROM integrator_push_outbox
       WHERE status = 'pending' AND next_try_at <= now()
       ORDER BY next_try_at ASC
       LIMIT $1
       FOR UPDATE SKIP LOCKED
     )
     UPDATE integrator_push_outbox o
     SET status = 'processing', updated_at = now()
     FROM due WHERE o.id = due.id
     RETURNING
       o.id::text AS id,
       o.kind,
       o.idempotency_key,
       o.payload,
       o.attempts_done,
       o.max_attempts`,
    [Math.max(1, Math.trunc(limit))],
  );
  return res.rows
    .filter((r) => isKind(r.kind))
    .map((r) => ({
      id: r.id,
      kind: r.kind as IntegratorPushKind,
      idempotencyKey: r.idempotency_key,
      payload: r.payload,
      attemptsDone: r.attempts_done,
      maxAttempts: r.max_attempts,
    }));
}

export async function completeIntegratorPushJob(db: Pool | PoolClient, id: string): Promise<void> {
  await db.query(`UPDATE integrator_push_outbox SET status = 'done', updated_at = now() WHERE id = $1::bigint`, [
    id,
  ]);
}

export async function failIntegratorPushJobDead(db: Pool | PoolClient, id: string, lastError: string): Promise<void> {
  await db.query(
    `UPDATE integrator_push_outbox SET status = 'dead', last_error = $2, updated_at = now() WHERE id = $1::bigint`,
    [id, lastError.slice(0, 4000)],
  );
}

export async function rescheduleIntegratorPushJob(
  db: Pool | PoolClient,
  id: string,
  attemptsDone: number,
  retryDelaySeconds: number,
  lastError: string,
): Promise<void> {
  await db.query(
    `UPDATE integrator_push_outbox
     SET status = 'pending',
         attempts_done = $2,
         next_try_at = now() + (($3::text || ' seconds')::interval),
         last_error = $4,
         updated_at = now()
     WHERE id = $1::bigint`,
    [id, Math.max(0, attemptsDone), String(Math.max(1, retryDelaySeconds)), lastError.slice(0, 4000)],
  );
}

export function isRecoverableIntegratorPushFailure(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg === "integrator_m2m_unconfigured") return true;
  const m = /integrator \S+ (\d{3}):/.exec(msg);
  if (!m) return true;
  const status = Number(m[1]);
  if (!Number.isFinite(status)) return true;
  if (status >= 500) return true;
  if (status === 408 || status === 429) return true;
  return false;
}
