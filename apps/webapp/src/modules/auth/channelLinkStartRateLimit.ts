/**
 * Ограничение частоты POST /api/auth/channel-link/start по `userId` сессии.
 * Тот же механизм, что у {@link isMessengerStartRateLimited}: БД + fallback in-memory.
 */
import { env } from "@/config/env";
import { getPool } from "@/infra/db/client";

const WINDOW_MS = 60 * 60 * 1000;
const MAX_STARTS_PER_WINDOW = 30;
const SCOPE = "auth.channel_link_start";

const buckets = new Map<string, number[]>();
let dbUnavailable = false;

function pruneEmptyBuckets(windowStart: number): void {
  if (buckets.size < 2000) return;
  for (const [k, times] of buckets) {
    const next = times.filter((t) => t > windowStart);
    if (next.length === 0) buckets.delete(k);
    else buckets.set(k, next);
  }
}

function isRateLimitedInMemory(userId: string): boolean {
  const now = Date.now();
  const windowStart = now - WINDOW_MS;
  pruneEmptyBuckets(windowStart);
  const prev = buckets.get(userId) ?? [];
  const next = prev.filter((t) => t > windowStart);
  if (next.length >= MAX_STARTS_PER_WINDOW) {
    buckets.set(userId, next);
    return true;
  }
  next.push(now);
  buckets.set(userId, next);
  return false;
}

async function isRateLimitedDb(userId: string): Promise<boolean> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`${SCOPE}:${userId}`]);

    const windowStart = new Date(Date.now() - WINDOW_MS);
    await client.query(
      "DELETE FROM auth_rate_limit_events WHERE scope = $1 AND key = $2 AND occurred_at <= $3",
      [SCOPE, userId, windowStart],
    );

    const countResult = await client.query<{ c: string }>(
      "SELECT COUNT(*)::text AS c FROM auth_rate_limit_events WHERE scope = $1 AND key = $2",
      [SCOPE, userId],
    );
    const attempts = Number.parseInt(countResult.rows[0]?.c ?? "0", 10);
    if (attempts >= MAX_STARTS_PER_WINDOW) {
      await client.query("COMMIT");
      return true;
    }

    await client.query(
      "INSERT INTO auth_rate_limit_events (scope, key, occurred_at) VALUES ($1, $2, now())",
      [SCOPE, userId],
    );
    await client.query("COMMIT");
    return false;
  } catch {
    await client.query("ROLLBACK").catch(() => undefined);
    dbUnavailable = true;
    return isRateLimitedInMemory(userId);
  } finally {
    client.release();
  }
}

export async function isChannelLinkStartRateLimited(userId: string): Promise<boolean> {
  const uid = userId.trim();
  if (!uid) return false;
  if (!env.DATABASE_URL || dbUnavailable) {
    return isRateLimitedInMemory(uid);
  }
  return isRateLimitedDb(uid);
}
