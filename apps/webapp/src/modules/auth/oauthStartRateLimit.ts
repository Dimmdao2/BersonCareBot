/**
 * Ограничение частоты POST /api/auth/oauth/start по клиенту.
 * Ключ — только X-Real-Ip (nginx должен выставить $remote_addr); X-Forwarded-For не используется
 * (клиент может подставить левый первый hop при $proxy_add_x_forwarded_for).
 *
 * Production: без непустого X-Real-Ip маршрут не должен обрабатывать запрос (fail-closed на route);
 * здесь только разрешение ключа и лог infra-ошибки.
 * Development / test: общий fallback-ключ + debug, чтобы локальные запросы без прокси работали.
 */
import { env } from "@/config/env";
import { getPool } from "@/infra/db/client";
import { logger } from "@/infra/logging/logger";

const WINDOW_MS = 60 * 60 * 1000;
const MAX_STARTS_PER_WINDOW = 60;
const SCOPE = "auth.oauth_start";

/** Общий bucket только в non-production, если прокси не передал X-Real-Ip. */
export const OAUTH_START_FALLBACK_CLIENT_KEY = "oauth_start:missing_x_real_ip";

export type OAuthStartRateLimitClientKeyResult =
  | { ok: true; key: string }
  | { ok: false; reason: "missing_x_real_ip" };

const buckets = new Map<string, number[]>();
let dbUnavailable = false;

/**
 * Клиентский ключ для rate limit: только доверенный `X-Real-Ip` от nginx.
 * В production при отсутствии заголовка — `ok: false` (без fallback-ключа).
 */
export function resolveOAuthStartRateLimitClientKey(request: Request): OAuthStartRateLimitClientKeyResult {
  const real = request.headers.get("x-real-ip")?.trim();
  if (real && real.length > 0) {
    return { ok: true, key: real };
  }

  if (env.NODE_ENV === "production") {
    logger.error({
      msg: "oauth_start_x_real_ip_required",
      scope: SCOPE,
      reason: "missing_x_real_ip",
    });
    return { ok: false, reason: "missing_x_real_ip" };
  }

  logger.debug({ msg: "oauth_start_missing_x_real_ip", scope: SCOPE });
  return { ok: true, key: OAUTH_START_FALLBACK_CLIENT_KEY };
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

export async function isOAuthStartRateLimitedByKey(key: string): Promise<boolean> {
  if (!env.DATABASE_URL || dbUnavailable) {
    return isOAuthStartRateLimitedInMemory(key);
  }
  return isOAuthStartRateLimitedDb(key);
}
