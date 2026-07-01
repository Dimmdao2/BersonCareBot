import { getPool } from "@/infra/db/client";
import { loadWarmupsSectionSlugs } from "@/infra/repos/pgWarmupsSectionSlugs";

const TTL_MS = 60_000; // 1 min — slugs change rarely; refresh on next request after expiry

type CacheEntry = { slugs: Set<string>; expiresAt: number };
let cache: CacheEntry | null = null;

/**
 * Returns the cached set of warmup section slugs.
 * On miss or expiry refetches from DB; on error returns last good value or empty set.
 */
export async function getCachedWarmupSlugs(): Promise<Set<string>> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) return cache.slugs;
  try {
    const slugs = await loadWarmupsSectionSlugs(getPool());
    cache = { slugs, expiresAt: now + TTL_MS };
    return slugs;
  } catch {
    // Keep stale data rather than breaking analytics ingest
    return cache?.slugs ?? new Set();
  }
}

/** Reset the in-process cache; for use in tests. */
export function resetWarmupSlugCacheForTests(): void {
  cache = null;
}
