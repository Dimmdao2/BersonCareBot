/**
 * Config adapter: dual-read — DB (system_settings) → env fallback.
 * In-memory TTL cache (60 sec) per key.
 * Used for non-secret runtime config: URLs, flags, IDs.
 * Integration secrets (OAuth client secret и т.д.) хранятся в `system_settings` (admin), см. `integrationRuntime`.
 */

import { runWebappPgText } from "@/infra/db/runWebappSql";
import { parseSettingEnvelopeValue, parseSmsFallbackEnabledValue } from "./parseSettingValueJson";

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

function envelopeValueToString(v: unknown): string | null {
  if (typeof v === "string") return v.trim() || null;
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") return String(v);
  if (typeof v === "object" && v !== null && !Array.isArray(v)) {
    try {
      return JSON.stringify(v);
    } catch {
      return null;
    }
  }
  if (Array.isArray(v)) {
    const normalized = v.map((item) => String(item).trim()).filter(Boolean);
    return normalized.length > 0 ? JSON.stringify(normalized) : null;
  }
  return null;
}

async function fetchFromDb(key: string): Promise<string | null> {
  try {
    const result = await runWebappPgText<{ value_json: unknown }>(
      `SELECT value_json FROM system_settings WHERE key = $1 AND scope = 'admin' LIMIT 1`,
      [key],
    );
    const row = result.rows[0];
    if (!row) return null;
    const v = parseSettingEnvelopeValue(row.value_json);
    if (v === null) return null;
    return envelopeValueToString(v);
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
    const r = await runWebappPgText<{ value_json: unknown }>(
      `SELECT value_json FROM system_settings
       WHERE key = 'sms_fallback_enabled' AND scope IN ('doctor', 'admin')
       ORDER BY CASE scope WHEN 'doctor' THEN 0 ELSE 1 END
       LIMIT 1`,
    );
    const row = r.rows[0];
    if (!row) return true;
    const b = parseSmsFallbackEnabledValue(row.value_json);
    return b ?? true;
  } catch {
    return true;
  }
}
