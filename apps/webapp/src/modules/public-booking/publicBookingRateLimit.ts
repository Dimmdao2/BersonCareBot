/**
 * Rate limit для публичного POST /api/booking/public/create.
 * Ключ — X-Real-Ip (как OAuth); в dev — fallback.
 */
import { env } from "@/config/env";
import { getPool } from "@/infra/db/client";
import { logger } from "@/infra/logging/logger";

const WINDOW_MS = 60 * 60 * 1000;
const MAX_CREATES_PER_WINDOW = 20;
const SCOPE = "booking.public_create";

export const PUBLIC_BOOKING_RATE_LIMIT_SEC = 3600;
export const PUBLIC_BOOKING_FALLBACK_CLIENT_KEY = "public_booking:missing_x_real_ip";

export type PublicBookingRateLimitKeyResult =
  | { ok: true; key: string }
  | { ok: false; reason: "missing_x_real_ip" };

const buckets = new Map<string, number[]>();
let dbUnavailable = false;

export function resolvePublicBookingRateLimitClientKey(request: Request): PublicBookingRateLimitKeyResult {
  const real = request.headers.get("x-real-ip")?.trim();
  if (real && real.length > 0) {
    return { ok: true, key: real };
  }
  if (env.NODE_ENV === "production") {
    logger.error({ msg: "public_booking_x_real_ip_required", scope: SCOPE });
    return { ok: false, reason: "missing_x_real_ip" };
  }
  logger.debug({ msg: "public_booking_missing_x_real_ip", scope: SCOPE });
  return { ok: true, key: PUBLIC_BOOKING_FALLBACK_CLIENT_KEY };
}

function pruneEmptyBuckets(windowStart: number): void {
  if (buckets.size < 2000) return;
  for (const [k, times] of buckets) {
    const next = times.filter((t) => t > windowStart);
    if (next.length === 0) buckets.delete(k);
    else buckets.set(k, next);
  }
}

function isRateLimitedInMemory(key: string): boolean {
  const now = Date.now();
  const windowStart = now - WINDOW_MS;
  pruneEmptyBuckets(windowStart);
  const prev = buckets.get(key) ?? [];
  const next = prev.filter((t) => t > windowStart);
  if (next.length >= MAX_CREATES_PER_WINDOW) {
    buckets.set(key, next);
    return true;
  }
  next.push(now);
  buckets.set(key, next);
  return false;
}

async function isRateLimitedDb(key: string): Promise<boolean> {
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
    if (attempts >= MAX_CREATES_PER_WINDOW) {
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
    return isRateLimitedInMemory(key);
  } finally {
    client.release();
  }
}

export async function isPublicBookingCreateRateLimited(key: string): Promise<boolean> {
  if (!env.DATABASE_URL || dbUnavailable) {
    return isRateLimitedInMemory(key);
  }
  return isRateLimitedDb(key);
}
