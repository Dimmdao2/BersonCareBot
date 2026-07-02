/**
 * Config adapter: dual-read — DB (system_settings) → env fallback.
 * In-memory TTL cache (60 sec) per key.
 * Used for non-secret runtime config: URLs, flags, IDs.
 * Integration secrets (OAuth client secret и т.д.) хранятся в `system_settings` (admin), см. `integrationRuntime`.
 */

import {
  readAdminSystemSettingString,
  readSystemSettingInnerValueByScopes,
  systemSettingInnerValueToString,
} from "@/infra/repos/pgSystemSettings";

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
    return await readAdminSystemSettingString(key);
  } catch {
    return null;
  }
}

/**
 * Synchronous read: cache hit → env fallback (no DB). Use after async warm-up or accept first-hit env.
 */
export function getConfigValueSync(key: string, envFallback: string): string {
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && now - cached.fetchedAt < TTL_MS) {
    return cached.value;
  }
  return envFallback;
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

/**
 * Integer from `system_settings` with bounds. Non-numeric or out-of-range → `defaultValue`.
 */
export async function getConfigPositiveInt(
  key: string,
  defaultValue: number,
  opts: { min: number; max: number },
): Promise<number> {
  const raw = await getConfigValue(key, String(defaultValue));
  const n = Number.parseInt(String(raw).trim(), 10);
  if (!Number.isFinite(n) || n < 1) {
    return defaultValue;
  }
  return Math.min(opts.max, Math.max(opts.min, n));
}

/**
 * SMS fallback для OTP / записи: ключ `sms_fallback_enabled` в `system_settings`;
 * приоритет строки `doctor`, затем `admin` (сид из миграций).
 * Реализация здесь — рядом с {@link getConfigValue} (тот же allowlist `no-restricted-imports` для адаптера).
 */
export async function getSmsFallbackEnabled(): Promise<boolean> {
  try {
    const value = await readSystemSettingInnerValueByScopes(
      "sms_fallback_enabled",
      ["doctor", "admin"],
    );
    const normalized = systemSettingInnerValueToString(value);
    if (normalized === "true" || normalized === "1") return true;
    if (normalized === "false" || normalized === "0") return false;
    return true;
  } catch {
    return true;
  }
}
