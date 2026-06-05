import { env } from "@/config/env";
import type { AuthRateLimitDbPort } from "@/modules/auth/authRateLimitPort";

export type SlidingWindowRateLimitConfig = {
  scope: string;
  windowMs: number;
  maxPerWindow: number;
  db: AuthRateLimitDbPort;
  /** Optional cap on in-memory bucket map size before prune. */
  pruneBucketThreshold?: number;
};

/**
 * Sliding-window rate limit with DB persistence and in-memory fallback when DB is unavailable.
 */
export function createSlidingWindowRateLimit(config: SlidingWindowRateLimitConfig) {
  const buckets = new Map<string, number[]>();
  let dbUnavailable = false;
  const pruneThreshold = config.pruneBucketThreshold ?? 2000;

  function pruneEmptyBuckets(windowStart: number): void {
    if (buckets.size < pruneThreshold) return;
    for (const [k, times] of buckets) {
      const next = times.filter((t) => t > windowStart);
      if (next.length === 0) buckets.delete(k);
      else buckets.set(k, next);
    }
  }

  function isLimitedInMemory(key: string): boolean {
    const now = Date.now();
    const windowStart = now - config.windowMs;
    pruneEmptyBuckets(windowStart);
    const prev = buckets.get(key) ?? [];
    const next = prev.filter((t) => t > windowStart);
    if (next.length >= config.maxPerWindow) {
      buckets.set(key, next);
      return true;
    }
    next.push(now);
    buckets.set(key, next);
    return false;
  }

  async function isLimitedDb(key: string): Promise<boolean> {
    try {
      return await config.db.checkAndRecord({
        scope: config.scope,
        key,
        windowMs: config.windowMs,
        maxPerWindow: config.maxPerWindow,
      });
    } catch {
      dbUnavailable = true;
      return isLimitedInMemory(key);
    }
  }

  return async function isRateLimited(key: string): Promise<boolean> {
    if (!env.DATABASE_URL || dbUnavailable) {
      return isLimitedInMemory(key);
    }
    return isLimitedDb(key);
  };
}
