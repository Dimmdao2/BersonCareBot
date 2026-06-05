import { sql } from "drizzle-orm";
import { runWebappPgText, runWebappSql, runWebappTransaction } from "@/infra/db/runWebappSql";

export type AuthRateLimitCheckParams = {
  scope: string;
  key: string;
  windowMs: number;
  maxPerWindow: number;
};

/** Returns `true` when the key is rate-limited (event not recorded). */
export async function checkAndRecordAuthRateLimitEvent(params: AuthRateLimitCheckParams): Promise<boolean> {
  const { scope, key, windowMs, maxPerWindow } = params;
  const lockKey = `${scope}:${key}`;

  return runWebappTransaction(async (tx) => {
    await runWebappSql(tx, sql`SELECT pg_advisory_xact_lock(hashtext(${lockKey}::text))`);

    const windowStart = new Date(Date.now() - windowMs);
    await runWebappPgText(
      "DELETE FROM auth_rate_limit_events WHERE scope = $1 AND key = $2 AND occurred_at <= $3",
      [scope, key, windowStart],
      tx,
    );

    const countResult = await runWebappPgText<{ c: string }>(
      "SELECT COUNT(*)::text AS c FROM auth_rate_limit_events WHERE scope = $1 AND key = $2",
      [scope, key],
      tx,
    );
    const attempts = Number.parseInt(countResult.rows[0]?.c ?? "0", 10);
    if (attempts >= maxPerWindow) {
      return true;
    }

    await runWebappPgText(
      "INSERT INTO auth_rate_limit_events (scope, key, occurred_at) VALUES ($1, $2, now())",
      [scope, key],
      tx,
    );
    return false;
  });
}
