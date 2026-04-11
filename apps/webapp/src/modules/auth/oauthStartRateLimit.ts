/**
 * Ограничение частоты POST /api/auth/oauth/start по клиенту (IP из прокси-заголовков).
 * Снижает перебор state/redirect; при отсутствии IP — лимит не применяется.
 */
import { env } from "@/config/env";
import { getPool } from "@/infra/db/client";

const WINDOW_MS = 60 * 60 * 1000;
const MAX_STARTS_PER_WINDOW = 60;
const SCOPE = "auth.oauth_start";

const buckets = new Map<string, number[]>();
let dbUnavailable = false;

/** Ключ для rate limit: первый hop из X-Forwarded-For или X-Real-Ip. */
export function oauthStartClientKeyFromRequest(request: Request): string | null {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) {
    const first = fwd.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = request.headers.get("x-real-ip")?.trim();
  return real && real.length > 0 ? real : null;
}

function pruneEmptyBuckets(windowStart: number): void {
  if (buckets.size < 2000) return;
  for (const [k, times] of buckets) {
    const next = times.filter((t) => t > windowStart);
    if (next.length === 0) buckets.delete(k);
    else buckets.set(k, next);
  }
}

function isOAuthStartRateLimitedInMemory(key: string): boolean {
  const now = Date.now();
  const windowStart = now - WINDOW_MS;
  pruneEmptyBuckets(windowStart);
  const prev = buckets.get(key) ?? [];
  const next = prev.filter((t) => t > windowStart);
  if (next.length >= MAX_STARTS_PER_WINDOW) {
    buckets.set(key, next);
    return true;
  }
  next.push(now);
  buckets.set(key, next);
  return false;
}

async function isOAuthStartRateLimitedDb(key: string): Promise<boolean> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`${SCOPE}:${key}`]);

    const windowStart = new Date(Date.now() - WINDOW_MS);
    await client.query(
      "DELETE FROM auth_rate_limit_events WHERE scope = $1 AND key = $2 AND occurred_at <= $3",
      [SCOPE, key, windowStart],
    );

    const countResult = await client.query<{ c: string }>(
      "SELECT COUNT(*)::text AS c FROM auth_rate_limit_events WHERE scope = $1 AND key = $2",
      [SCOPE, key],
    );
    const attempts = Number.parseInt(countResult.rows[0]?.c ?? "0", 10);
    if (attempts >= MAX_STARTS_PER_WINDOW) {
      await client.query("COMMIT");
      return true;
    }

    await client.query(
      "INSERT INTO auth_rate_limit_events (scope, key, occurred_at) VALUES ($1, $2, now())",
      [SCOPE, key],
    );
    await client.query("COMMIT");
    return false;
  } catch {
    await client.query("ROLLBACK").catch(() => undefined);
    dbUnavailable = true;
    return isOAuthStartRateLimitedInMemory(key);
  } finally {
    client.release();
  }
}

export async function isOAuthStartRateLimited(request: Request): Promise<boolean> {
  const key = oauthStartClientKeyFromRequest(request);
  if (!key) return false;
  if (!env.DATABASE_URL || dbUnavailable) {
    return isOAuthStartRateLimitedInMemory(key);
  }
  return isOAuthStartRateLimitedDb(key);
}
