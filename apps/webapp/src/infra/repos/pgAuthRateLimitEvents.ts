import { sql } from 'drizzle-orm';
import { getWebappSqlDb, runWebappNamedRoot } from '@/infra/db/runWebappSql';
import type { AuthRateLimitAttemptResult } from '@/modules/auth/authRateLimitPort';

export type AuthRateLimitCheckParams = {
  scope: string;
  key: string;
  windowMs: number;
  maxPerWindow: number;
  scopePrune?: {
    retentionMs: number;
    batchSize: number;
  };
};

export const AUTH_RATE_LIMIT_SCOPE_PRUNE_MAX_BATCH = 1_000;
const CHECK_AND_RECORD_ACTION = 'check_and_record';

/** Returns `true` when the key is rate-limited (event not recorded). */
export async function checkAndRecordAuthRateLimitEvent(
  params: AuthRateLimitCheckParams,
): Promise<boolean> {
  return (await recordAndCountAuthRateLimitEvent(params)).limited;
}

/** Atomically records one event below the cap and returns the active attempt count. */
export async function recordAndCountAuthRateLimitEvent(
  params: AuthRateLimitCheckParams,
): Promise<AuthRateLimitAttemptResult> {
  const { scope, key, windowMs, maxPerWindow, scopePrune } = params;
  const exactWindowMs = Math.max(1, Math.floor(windowMs));
  const exactLimit = Math.max(0, Math.floor(maxPerWindow));
  const retentionMs = scopePrune
    ? Math.max(exactWindowMs, Math.floor(scopePrune.retentionMs))
    : null;
  const batchSize = scopePrune
    ? Math.max(1, Math.min(AUTH_RATE_LIMIT_SCOPE_PRUNE_MAX_BATCH, Math.floor(scopePrune.batchSize)))
    : null;
  const result = await runWebappNamedRoot<{ limited: boolean; attempts: number }>(
    getWebappSqlDb(),
    'app.auth_rate_limit_check_and_record(text,text,integer,integer,text,integer,integer)',
    [scope, key, exactWindowMs, exactLimit, CHECK_AND_RECORD_ACTION, retentionMs, batchSize],
    sql`SELECT limited, attempts
          FROM app.auth_rate_limit_check_and_record(
            ${scope}, ${key}, ${exactWindowMs}::integer, ${exactLimit}::integer,
            ${CHECK_AND_RECORD_ACTION}, ${retentionMs}::integer, ${batchSize}::integer
          )`,
  );
  const row = result.rows[0];
  if (!row) throw new Error('auth rate-limit root returned no result');
  return row;
}
