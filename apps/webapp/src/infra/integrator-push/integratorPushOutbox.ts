/** Wave 3 phase 15D — `public.integrator_push_outbox` via Drizzle insert/update + claim `execute(sql)`. */
import { eq, sql } from "drizzle-orm";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import {
  getWebappSqlDb,
  getWebappSqlFromPgClient,
  runWebappSql,
  type WebappSqlExecutor,
} from "@/infra/db/runWebappSql";
import { integratorPushOutbox } from "../../../db/schema/schema";

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

function isPgPool(db: Pool | PoolClient): db is Pool {
  return typeof (db as Pool).connect === "function";
}

function integratorPushExecutor(db: Pool | PoolClient): WebappSqlExecutor {
  return isPgPool(db) ? getWebappSqlDb() : getWebappSqlFromPgClient(db);
}

function pushOutboxId(id: string): bigint {
  return BigInt(id);
}

function isKind(k: string): k is IntegratorPushKind {
  return (INTEGRATOR_PUSH_KINDS as readonly string[]).includes(k);
}

const claimedIntegratorPushRowSchema = z.object({
  id: z.union([z.string(), z.number(), z.bigint()]).transform(String),
  kind: z.string(),
  idempotency_key: z.string(),
  payload: z.record(z.string(), z.unknown()),
  attempts_done: z.coerce.number(),
  max_attempts: z.coerce.number(),
});

function mapClaimedRow(raw: z.infer<typeof claimedIntegratorPushRowSchema>): IntegratorPushOutboxRow | null {
  if (!isKind(raw.kind)) return null;
  return {
    id: raw.id,
    kind: raw.kind,
    idempotencyKey: raw.idempotency_key,
    payload: raw.payload,
    attemptsDone: raw.attempts_done,
    maxAttempts: raw.max_attempts,
  };
}

/**
 * Insert or refresh payload and reset retry state (latest value wins for same idempotency key).
 */
export async function enqueueIntegratorPush(
  db: Pool | PoolClient,
  input: { kind: IntegratorPushKind; idempotencyKey: string; payload: Record<string, unknown> },
): Promise<void> {
  await enqueueIntegratorPushWithExecutor(integratorPushExecutor(db), input);
}

export async function enqueueIntegratorPushDefault(
  input: { kind: IntegratorPushKind; idempotencyKey: string; payload: Record<string, unknown> },
): Promise<void> {
  await enqueueIntegratorPushWithExecutor(getWebappSqlDb(), input);
}

async function enqueueIntegratorPushWithExecutor(
  d: WebappSqlExecutor,
  input: { kind: IntegratorPushKind; idempotencyKey: string; payload: Record<string, unknown> },
): Promise<void> {
  await d
    .insert(integratorPushOutbox)
    .values({
      kind: input.kind,
      idempotencyKey: input.idempotencyKey,
      payload: input.payload,
      status: "pending",
      nextTryAt: sql`now()`,
    })
    .onConflictDoUpdate({
      target: integratorPushOutbox.idempotencyKey,
      set: {
        kind: input.kind,
        payload: input.payload,
        status: "pending",
        attemptsDone: 0,
        nextTryAt: sql`now()`,
        lastError: null,
        updatedAt: sql`now()`,
      },
    });
}

export async function claimDueIntegratorPushJobs(
  db: Pool | PoolClient,
  limit: number,
): Promise<IntegratorPushOutboxRow[]> {
  const d = integratorPushExecutor(db);
  const lim = Math.max(1, Math.trunc(limit));
  const res = await runWebappSql<z.infer<typeof claimedIntegratorPushRowSchema>>(
    d,
    sql`
    WITH due AS (
       SELECT id FROM integrator_push_outbox
       WHERE status = 'pending' AND next_try_at <= now()
       ORDER BY next_try_at ASC
       LIMIT ${lim}
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
       o.max_attempts
    `,
  );
  const out: IntegratorPushOutboxRow[] = [];
  for (const row of res.rows) {
    const parsed = claimedIntegratorPushRowSchema.safeParse(row);
    if (!parsed.success) continue;
    const mapped = mapClaimedRow(parsed.data);
    if (mapped) out.push(mapped);
  }
  return out;
}

export async function completeIntegratorPushJob(db: Pool | PoolClient, id: string): Promise<void> {
  const d = integratorPushExecutor(db);
  await d
    .update(integratorPushOutbox)
    .set({ status: "done", updatedAt: sql`now()` })
    .where(eq(integratorPushOutbox.id, pushOutboxId(id)));
}

export async function failIntegratorPushJobDead(db: Pool | PoolClient, id: string, lastError: string): Promise<void> {
  const d = integratorPushExecutor(db);
  await d
    .update(integratorPushOutbox)
    .set({ status: "dead", lastError: lastError.slice(0, 4000), updatedAt: sql`now()` })
    .where(eq(integratorPushOutbox.id, pushOutboxId(id)));
}

export async function rescheduleIntegratorPushJob(
  db: Pool | PoolClient,
  id: string,
  attemptsDone: number,
  retryDelaySeconds: number,
  lastError: string,
): Promise<void> {
  const d = integratorPushExecutor(db);
  const delay = Math.max(1, retryDelaySeconds);
  const attempts = Math.max(0, attemptsDone);
  await d
    .update(integratorPushOutbox)
    .set({
      status: "pending",
      attemptsDone: attempts,
      nextTryAt: sql`now() + (${String(delay)}::text || ' seconds')::interval`,
      lastError: lastError.slice(0, 4000),
      updatedAt: sql`now()`,
    })
    .where(eq(integratorPushOutbox.id, pushOutboxId(id)));
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
