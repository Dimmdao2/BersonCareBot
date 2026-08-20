import { sql } from 'drizzle-orm';
import type { DbPort } from '../../../kernel/contracts/index.js';
import type { UpsertReminderRuleDirectInput } from '../directPublic/writeReminderRulesDirect.js';
import type { AppendSupportDeliveryEventDirectInput } from '../directPublic/writeSupportQuestionsDirect.js';
import type {
  ContentAccessGrantDirectInput,
  ReminderDeliveryLoggedDirectInput,
  ReminderOccurrenceFinalizedDirectInput,
} from '../directPublic/writeReminderProjectionDirect.js';
import { runIntegratorSql } from '../runIntegratorSql.js';

export type DirectPublicWriteRetryOperation =
  | 'reminder_rule_upsert'
  | 'support_delivery_attempt_append'
  | 'reminder_occurrence_sent_record'
  | 'reminder_occurrence_failed_record'
  | 'reminder_occurrence_expired_record'
  | 'reminder_delivery_log_append'
  | 'content_access_grant_upsert';

export type DirectPublicWriteRetryPayload =
  | UpsertReminderRuleDirectInput
  | AppendSupportDeliveryEventDirectInput
  | ReminderOccurrenceFinalizedDirectInput
  | ReminderDeliveryLoggedDirectInput
  | ContentAccessGrantDirectInput;

export type DirectPublicWriteRetryRow = {
  id: number;
  operation: DirectPublicWriteRetryOperation;
  organizationId: string;
  idempotencyKey: string;
  payload: DirectPublicWriteRetryPayload;
  attemptCount: number;
  maxAttempts: number;
};

type EnqueueDirectPublicWriteRetryInput = {
  operation: DirectPublicWriteRetryOperation;
  organizationId: string;
  idempotencyKey: string;
  payload: DirectPublicWriteRetryPayload;
};

export async function enqueueDirectPublicWriteRetry(
  db: DbPort,
  input: EnqueueDirectPublicWriteRetryInput,
): Promise<void> {
  await runIntegratorSql(
    db,
    sql`INSERT INTO integrator.direct_public_write_retries (
      operation, organization_id, idempotency_key, payload
    ) VALUES (
      ${input.operation}, ${input.organizationId}::uuid, ${input.idempotencyKey},
      ${JSON.stringify(input.payload)}::jsonb
    ) ON CONFLICT (idempotency_key) DO NOTHING`,
  );
}

export async function claimDueDirectPublicWriteRetries(
  db: DbPort,
  limit: number,
): Promise<DirectPublicWriteRetryRow[]> {
  const cappedLimit = Math.max(1, Math.trunc(limit));
  const result = await runIntegratorSql<{
    id: number;
    operation: DirectPublicWriteRetryOperation;
    organization_id: string;
    idempotency_key: string;
    payload: DirectPublicWriteRetryPayload;
    attempt_count: number;
    max_attempts: number;
  }>(
    db,
    sql`WITH due AS (
      SELECT id
      FROM integrator.direct_public_write_retries
      WHERE status = 'pending' AND next_try_at <= now()
      ORDER BY next_try_at ASC
      LIMIT ${cappedLimit}
      FOR UPDATE SKIP LOCKED
    )
    UPDATE integrator.direct_public_write_retries AS retry
    SET status = 'processing',
        attempt_count = retry.attempt_count + 1,
        updated_at = now()
    FROM due
    WHERE retry.id = due.id
    RETURNING retry.id, retry.operation, retry.organization_id, retry.idempotency_key,
      retry.payload, retry.attempt_count, retry.max_attempts`,
  );
  return result.rows.map((row) => ({
    id: row.id,
    operation: row.operation,
    organizationId: row.organization_id,
    idempotencyKey: row.idempotency_key,
    payload: row.payload,
    attemptCount: row.attempt_count,
    maxAttempts: row.max_attempts,
  }));
}

/** A process can die after claiming a row; return that durable row to pending rather than stranding it. */
export async function reclaimStaleDirectPublicWriteRetries(
  db: DbPort,
  staleAfterMinutes = 15,
): Promise<number> {
  const minutes = Math.max(1, Math.trunc(staleAfterMinutes));
  const result = await runIntegratorSql<{ id: number }>(
    db,
    sql`WITH stale AS (
      SELECT id
      FROM integrator.direct_public_write_retries
      WHERE status = 'processing'
        AND updated_at < now() - ((${String(minutes)}::text || ' minutes')::interval)
      FOR UPDATE SKIP LOCKED
    )
    UPDATE integrator.direct_public_write_retries AS retry
    SET status = 'pending', next_try_at = now(), updated_at = now()
    FROM stale
    WHERE retry.id = stale.id
    RETURNING retry.id`,
  );
  return result.rows.length;
}

export async function completeDirectPublicWriteRetry(db: DbPort, id: number): Promise<void> {
  await runIntegratorSql(
    db,
    sql`UPDATE integrator.direct_public_write_retries
      SET status = 'done', last_error = NULL, updated_at = now()
      WHERE id = ${id} AND status = 'processing'`,
  );
}

export async function failDirectPublicWriteRetry(
  db: DbPort,
  id: number,
  lastError: string,
): Promise<void> {
  await runIntegratorSql(
    db,
    sql`UPDATE integrator.direct_public_write_retries
      SET status = 'dead', last_error = ${lastError}, updated_at = now()
      WHERE id = ${id} AND status = 'processing'`,
  );
}

export async function rescheduleDirectPublicWriteRetry(
  db: DbPort,
  input: { id: number; lastError: string; retryDelaySeconds: number },
): Promise<void> {
  const delaySeconds = Math.max(1, Math.trunc(input.retryDelaySeconds));
  await runIntegratorSql(
    db,
    sql`UPDATE integrator.direct_public_write_retries
      SET status = 'pending',
          last_error = ${input.lastError},
          next_try_at = now() + (${String(delaySeconds)}::text || ' seconds')::interval,
          updated_at = now()
      WHERE id = ${input.id} AND status = 'processing'`,
  );
}
