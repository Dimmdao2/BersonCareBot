import { env, webappRuntimeDatabaseIsConfigured } from '@/config/env';
import { logger } from '@/infra/logging/logger';
import type { AuthRateLimitDbPort } from '@/modules/auth/authRateLimitPort';

export type SlidingWindowRateLimitConfig = {
  scope: string;
  windowMs: number;
  maxPerWindow: number;
  db: Pick<AuthRateLimitDbPort, 'checkAndRecord'>;
  /** Optional in-process cadence plus DB-bounded cleanup for this limiter scope. */
  scopePrune?: {
    retentionMs: number;
    intervalMs: number;
    batchSize: number;
  };
  /** Optional cap on in-memory bucket map size before prune. */
  pruneBucketThreshold?: number;
};

/**
 * Sliding-window rate limit with DB persistence and in-memory fallback when DB is unavailable.
 */
export function createSlidingWindowRateLimit(config: SlidingWindowRateLimitConfig) {
  const buckets = new Map<string, number[]>();
  let dbUnavailable = false;
  let scopePruneInFlight = false;
  let nextScopePruneAt = 0;
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
    const now = Date.now();
    const shouldPrune = Boolean(
      config.scopePrune && !scopePruneInFlight && now >= nextScopePruneAt,
    );
    if (shouldPrune && config.scopePrune) {
      scopePruneInFlight = true;
      nextScopePruneAt = now + config.scopePrune.intervalMs;
    }
    try {
      return await config.db.checkAndRecord({
        scope: config.scope,
        key,
        windowMs: config.windowMs,
        maxPerWindow: config.maxPerWindow,
        ...(shouldPrune && config.scopePrune
          ? {
              scopePrune: {
                retentionMs: config.scopePrune.retentionMs,
                batchSize: config.scopePrune.batchSize,
              },
            }
          : {}),
      });
    } catch (err) {
      const shouldLogFallback = !dbUnavailable;
      dbUnavailable = true;
      if (shouldLogFallback) {
        logger.warn(
          {
            err,
            scope: config.scope,
            event: 'auth_rate_limit_db_fallback',
          },
          '[auth-rate-limit] database unavailable; permanently using in-memory fallback',
        );
      }
      return isLimitedInMemory(key);
    } finally {
      if (shouldPrune) scopePruneInFlight = false;
    }
  }

  return async function isRateLimited(key: string): Promise<boolean> {
    if (!webappRuntimeDatabaseIsConfigured() || dbUnavailable) {
      return isLimitedInMemory(key);
    }
    return isLimitedDb(key);
  };
}
