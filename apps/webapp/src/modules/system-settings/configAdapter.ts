/**
 * Config adapter: dual-read — DB (system_settings) → env fallback.
 * In-memory TTL cache (60 sec) per key.
 * Used for non-secret runtime config: URLs, flags, IDs.
 * Integration secrets (OAuth client secret и т.д.) хранятся в `system_settings` (admin), см. `integrationRuntime`.
 */

import {
  readAdminSystemSettingString,
  readIsSmtpOutboundConfigured,
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

/**
 * Fresh, fail-closed server authorization read. This deliberately bypasses
 * the 60-second compatibility cache and has no environment fallback.
 */
export function getFreshServerRuntimeTokenList(key: ServerRuntimeTokenListKey): Promise<string> {
  return safeRuntimeConfig.getServerTokenListStrict(key, "auth_role_config");
}

/** Invalidate all cached entries (call after PATCH /api/admin/settings). */
export function invalidateConfigCache(): void {
  cache.clear();
}

/** Invalidate a single key from cache. */
export function invalidateConfigKey(key: string): void {
  cache.delete(key);
  cache.delete(`server-token-list:${key}`);
  if (key === "smtp_outbound") {
    cache.delete(SMTP_OUTBOUND_CONFIGURED_CACHE_KEY);
  }
}

/**
 * Two different things used to collapse into `null` here: "the database has no value for this key"
 * (an answer) and "the read never happened" (not an answer). The second one is what an anonymous
 * request gets on `system_settings` — a 42501 from the bare nonstaff login role — and caching it
 * poisoned the key for every consumer in the process for the whole TTL. They are now distinct.
 */
type SettingReadOutcome = { read: true; value: string | null } | { read: false };

async function fetchFromDb(key: string): Promise<SettingReadOutcome> {
  try {
    return { read: true, value: await readAdminSystemSettingString(key) };
  } catch {
    return { read: false };
  }
}

async function fetchPublicConfigBoolFromDb(key: string): Promise<boolean | null> {
  try {
    return await readPublicConfigBoolean(key);
  } catch {
    return null;
  }
}

async function fetchIsSmtpOutboundConfiguredFromDb(): Promise<boolean | null> {
  try {
    return await readIsSmtpOutboundConfigured();
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
 * A read that FAILED is not an answer: the caller still gets its fallback for this one call, but
 * nothing is written to the cache, so the next caller — which may hold a principal that is allowed
 * to read the table — asks the database again instead of inheriting a stranger's denial.
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

  const outcome = await fetchFromDb(key);
  if (!outcome.read) return envFallback;

  const resolved = outcome.value ?? envFallback;
  cache.set(key, { value: resolved, fetchedAt: now });
  return resolved;
}

/**
 * Public/pre-session STRING read through the whitelisted `app.read_public_runtime_setting`
 * SECURITY DEFINER accessor (`infra/repos/pgAppRuntimeSettings.ts`, wrapped in
 * `runWithDbBootstrapPrincipal`) — the same sanctioned path {@link getPublicConfigBool} uses for
 * booleans, and the one `app_display_timezone` and the provider-enabled flags already take.
 *
 * Reachable by every DB role the anonymous surfaces run as, including the bootstrap pool that has
 * no SELECT on `system_settings`. Shares the TTL cache with {@link getConfigValue} so
 * {@link getConfigValueSync} (and therefore `getAppBaseUrlSync`) still sees the configured value,
 * and — like `getPublicConfigBool` — writes to that cache ONLY after a read that actually happened.
 */
export async function getPublicConfigValue(
  key: PublicRuntimeStringKey,
  envFallback: string,
): Promise<string> {
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && now - cached.fetchedAt < TTL_MS) {
    return cached.value;
  }
  let dbValue: string | null;
  try {
    dbValue = await safeRuntimeConfig.getPublicStringOrNull(key);
  } catch {
    return envFallback;
  }
  const resolved = dbValue?.trim() ? dbValue : envFallback;
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

const SMTP_OUTBOUND_CONFIGURED_CACHE_KEY = "__smtp_outbound_configured_accessor__";

/**
 * Whether outbound SMTP is configured, via the whitelisted boolean-only SECURITY DEFINER accessor
 * `app.is_smtp_outbound_configured()` (migration 0240) — never returns the credential itself.
 * Available to every DB role the public login screen runs as, including the unauthenticated
 * bootstrap pool that has no table SELECT on `system_settings`. Returns `null` (never throws) on any
 * accessor error, including the function being absent on an older DB, so the caller
 * (authChannelPolicy.ts:isSmtpConfigured) can degrade to its own fallback rather than 500.
 */
export async function getIsSmtpOutboundConfiguredOrNull(): Promise<boolean | null> {
  const now = Date.now();
  const cached = cache.get(SMTP_OUTBOUND_CONFIGURED_CACHE_KEY);
  if (cached && now - cached.fetchedAt < TTL_MS) {
    return cached.value === "true";
  }
  const dbValue = await fetchIsSmtpOutboundConfiguredFromDb();
  if (dbValue !== null) {
    cache.set(SMTP_OUTBOUND_CONFIGURED_CACHE_KEY, { value: dbValue ? "true" : "false", fetchedAt: now });
  }
  return dbValue;
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
