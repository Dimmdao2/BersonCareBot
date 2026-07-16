/**
 * Config adapter: dual-read — DB (system_settings) → env fallback.
 * In-memory TTL cache (60 sec) per key.
 * Used for non-secret runtime config: URLs, flags, IDs.
 * Integration secrets (OAuth client secret и т.д.) хранятся в `system_settings` (admin), см. `integrationRuntime`.
 */

import {
  readAdminSystemSettingString,
  readPublicConfigBoolean,
} from "@/infra/repos/pgSystemSettings";
import { createPgAppRuntimeSettingsPort } from "@/infra/repos/pgAppRuntimeSettings";
import {
  createRuntimeConfigProvider,
  type AuthenticatedRuntimeBooleanKey,
  type AuthenticatedRuntimeStringKey,
  type PublicRuntimeBooleanKey,
  type PublicRuntimeStringKey,
  type RuntimeConfigOperationFamily,
  type ServerRuntimeBooleanKey,
  type ServerRuntimeIntegerKey,
  type ServerRuntimeTokenListKey,
} from "./runtimeConfig";

const TTL_MS = 60_000;

type CacheEntry = {
  value: string;
  fetchedAt: number;
};

const cache = new Map<string, CacheEntry>();
const safeRuntimeConfig = createRuntimeConfigProvider(createPgAppRuntimeSettingsPort());

export function getPublicRuntimeBool(
  key: PublicRuntimeBooleanKey,
  operationFamily: RuntimeConfigOperationFamily = "public_auth_config",
): Promise<boolean> {
  return safeRuntimeConfig.getPublicBoolean(key, operationFamily);
}

export function getPublicRuntimeValue(
  key: PublicRuntimeStringKey,
  operationFamily: RuntimeConfigOperationFamily = "public_auth_config",
): Promise<string> {
  return safeRuntimeConfig.getPublicString(key, operationFamily);
}

export function getPatientRuntimeBool(key: AuthenticatedRuntimeBooleanKey): Promise<boolean> {
  return safeRuntimeConfig.getAuthenticatedBoolean(key);
}

export function getPatientRuntimeValue(
  key: AuthenticatedRuntimeStringKey,
  organizationId: string | null = null,
): Promise<string> {
  return safeRuntimeConfig.getAuthenticatedString(key, organizationId);
}

export function getServerRuntimeBool(key: ServerRuntimeBooleanKey): Promise<boolean> {
  return safeRuntimeConfig.getServerBoolean(key);
}

export function getServerRuntimeInteger(key: ServerRuntimeIntegerKey): Promise<number> {
  return safeRuntimeConfig.getServerInteger(key);
}

export function getServerRuntimeTokenList(
  key: ServerRuntimeTokenListKey,
  envFallback: string,
): Promise<string> {
  const cacheKey = `server-token-list:${key}`;
  const now = Date.now();
  const cached = cache.get(cacheKey);
  if (cached && now - cached.fetchedAt < TTL_MS) {
    return Promise.resolve(cached.value);
  }
  return safeRuntimeConfig.getServerTokenList(key, envFallback, "auth_role_config").then((value) => {
    cache.set(cacheKey, { value, fetchedAt: Date.now() });
    return value;
  });
}

/** Invalidate all cached entries (call after PATCH /api/admin/settings). */
export function invalidateConfigCache(): void {
  cache.clear();
}

/** Invalidate a single key from cache. */
export function invalidateConfigKey(key: string): void {
  cache.delete(key);
  cache.delete(`server-token-list:${key}`);
}

async function fetchFromDb(key: string): Promise<string | null> {
  try {
    return await readAdminSystemSettingString(key);
  } catch {
    return null;
  }
}

async function fetchPublicConfigBoolFromDb(key: string): Promise<boolean | null> {
  try {
    return await readPublicConfigBoolean(key);
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
 * Legacy public/pre-session boolean read through its whitelisted SECURITY DEFINER accessor.
 * New public reads use the typed app_runtime_settings projection helpers above.
 */
export async function getPublicConfigBool(key: string, envFallback: boolean): Promise<boolean> {
  const dbValue = await fetchPublicConfigBoolFromDb(key);
  if (dbValue !== null) {
    const now = Date.now();
    cache.set(key, { value: dbValue ? "true" : "false", fetchedAt: now });
    return dbValue;
  }
  return envFallback;
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
