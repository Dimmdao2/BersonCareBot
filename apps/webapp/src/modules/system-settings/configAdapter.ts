/**
 * Config adapter: dual-read — DB (system_settings) → env fallback.
 * In-memory TTL cache (60 sec) per key.
 * Used for non-secret runtime config: URLs, flags, IDs.
 * Integration secrets (OAuth client secret и т.д.) хранятся в `system_settings` (admin), см. `integrationRuntime`.
 */

import { getPool } from "@/infra/db/client";

const TTL_MS = 60_000;

type CacheEntry = {
  value: string;
  fetchedAt: number;
};

const cache = new Map<string, CacheEntry>();

/** Invalidate all cached entries (call after PATCH /api/admin/settings). */
export function invalidateConfigCache(): void {
  cache.clear();
}

/** Invalidate a single key from cache. */
export function invalidateConfigKey(key: string): void {
  cache.delete(key);
}

async function fetchFromDb(key: string): Promise<string | null> {
  try {
    const pool = getPool();
    const result = await pool.query<{ value_json: unknown }>(
      `SELECT value_json FROM system_settings WHERE key = $1 AND scope = 'admin' LIMIT 1`,
      [key]
    );
    const row = result.rows[0];
    if (!row) return null;
    const vj = row.value_json;
    if (vj !== null && typeof vj === "object" && "value" in vj) {
      const v = (vj as Record<string, unknown>).value;
      if (typeof v === "string") return v.trim() || null;
      if (typeof v === "boolean") return v ? "true" : "false";
      if (typeof v === "number") return String(v);
      if (Array.isArray(v)) {
        const normalized = v.map((item) => String(item).trim()).filter(Boolean);
        return normalized.length > 0 ? JSON.stringify(normalized) : null;
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Get a runtime config value.
 * Order: in-memory cache → system_settings DB → envFallback.
 *
 * @param key   The system_settings key (must be in ALLOWED_KEYS).
 * @param envFallback  The env-sourced fallback value.
 */
export async function getConfigValue(key: string, envFallback: string): Promise<string> {
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && now - cached.fetchedAt < TTL_MS) {
    return cached.value;
  }

  const dbValue = await fetchFromDb(key);
  const resolved = dbValue ?? envFallback;

  cache.set(key, { value: resolved, fetchedAt: now });
  return resolved;
}

/**
 * Get a boolean config value (DB stores "true"/"false" or boolean).
 */
export async function getConfigBool(key: string, envFallback: boolean): Promise<boolean> {
  const val = await getConfigValue(key, envFallback ? "true" : "false");
  return val === "true" || val === "1";
}
