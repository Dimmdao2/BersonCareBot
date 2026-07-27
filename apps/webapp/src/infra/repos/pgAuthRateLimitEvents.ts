import { sql } from "drizzle-orm";
import { runWebappPgText, runWebappSql, runWebappTransaction } from "@/infra/db/runWebappSql";

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

/** Returns `true` when the key is rate-limited (event not recorded). */
export async function checkAndRecordAuthRateLimitEvent(params: AuthRateLimitCheckParams): Promise<boolean> {
  const { scope, key, windowMs, maxPerWindow, scopePrune } = params;
  const lockKey = `${scope}:${key}`;

  return runWebappTransaction(async (tx) => {
    if (scopePrune) {
      const pruneLockKey = `auth-rate-limit-scope-prune:${scope}`;
      const lockResult = await runWebappPgText<{ acquired: boolean }>(
        "SELECT pg_try_advisory_xact_lock(hashtext($1::text)) AS acquired",
        [pruneLockKey],
        tx,
      );
      if (lockResult.rows[0]?.acquired) {
        const retentionMs = Math.max(windowMs, scopePrune.retentionMs);
        const retentionCutoff = new Date(Date.now() - retentionMs);
        const batchSize = Math.max(
          1,
          Math.min(AUTH_RATE_LIMIT_SCOPE_PRUNE_MAX_BATCH, Math.floor(scopePrune.batchSize)),
        );
        await runWebappPgText(
          "SELECT app.auth_rate_limit_prune_scope($1, $2, $3)",
          [scope, retentionCutoff, batchSize],
          tx,
        );
      }
    }

    await runWebappSql(tx, sql`SELECT pg_advisory_xact_lock(hashtext(${lockKey}::text))`);

    const windowStart = new Date(Date.now() - windowMs);
    await runWebappPgText(
      "SELECT app.auth_rate_limit_prune_key($1, $2, $3)",
      [scope, key, windowStart],
      tx,
    );

    const countResult = await runWebappPgText<{ c: string }>(
      "SELECT app.auth_rate_limit_count($1, $2)::text AS c",
      [scope, key],
      tx,
    );
    const attempts = Number.parseInt(countResult.rows[0]?.c ?? "0", 10);
    if (attempts >= maxPerWindow) {
      return true;
    }

    await runWebappPgText(
      "SELECT app.auth_rate_limit_record($1, $2)",
      [scope, key],
      tx,
    );
    return false;
  });
}
