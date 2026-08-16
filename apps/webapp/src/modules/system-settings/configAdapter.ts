/**
 * Config adapter: DB-only reads from system_settings.
 * In-memory TTL cache (60 sec) per key.
 * Used for non-secret runtime config: URLs, flags, IDs.
 * Integration secrets (OAuth client secret и т.д.) хранятся в `system_settings` (admin), см. `integrationRuntime`.
 */

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
} from './runtimeConfig';
import { RuntimeSettingUnavailableError } from './runtimeSettingUnavailable';
import type { PublicAuthChannelCapability } from './ports';
import { requireConfigAdapterPort, type ConfigAdapterPort } from './configAdapterPort';
import { ensureSystemSettingsConfigAdapterBound } from '@/app-layer/di/bindSystemSettingsConfigAdapter';

const TTL_MS = 60_000;

type CacheEntry = {
  settingKey: string;
  value: string;
  fetchedAt: number;
};

type CacheIdentity =
  | { kind: 'global'; settingKey: string }
  | { kind: 'exact-organization'; settingKey: string; organizationId: string }
  | {
      kind: 'auth-channel-configured';
      settingKey: string;
      channel: PublicAuthChannelCapability;
    };

function configCacheKey(identity: CacheIdentity): string {
  if (identity.kind === 'global') return identity.settingKey;
  if (identity.kind === 'auth-channel-configured') {
    return `__auth_channel_configured_accessor__:${identity.channel}`;
  }
  return `exact-org:${identity.organizationId}:${identity.settingKey}`;
}

function readCached(identity: CacheIdentity, now: number): string | null {
  const cached = cache.get(configCacheKey(identity));
  return cached && now - cached.fetchedAt < TTL_MS ? cached.value : null;
}

function writeCached(identity: CacheIdentity, value: string, fetchedAt: number): void {
  cache.set(configCacheKey(identity), { settingKey: identity.settingKey, value, fetchedAt });
}

const cache = new Map<string, CacheEntry>();
function currentConfigAdapterPort(): ConfigAdapterPort {
  // Next can instantiate instrumentation and a cold route handler as separate module graphs.
  // Bind in the one adapter chokepoint so the first request cannot observe an unbound port.
  ensureSystemSettingsConfigAdapterBound();
  return requireConfigAdapterPort();
}

function runtimeConfigProvider() {
  return createRuntimeConfigProvider(currentConfigAdapterPort().runtimeSettings);
}

export function getPublicRuntimeBool(
  key: PublicRuntimeBooleanKey,
  operationFamily: RuntimeConfigOperationFamily = 'public_auth_config',
): Promise<boolean> {
  return runtimeConfigProvider().getPublicBoolean(key, operationFamily);
}

export function getPublicRuntimeValue(
  key: PublicRuntimeStringKey,
  operationFamily: RuntimeConfigOperationFamily = 'public_auth_config',
): Promise<string> {
  return runtimeConfigProvider().getPublicString(key, operationFamily);
}

export function getPatientRuntimeBool(key: AuthenticatedRuntimeBooleanKey): Promise<boolean> {
  return runtimeConfigProvider().getAuthenticatedBoolean(key);
}

export function getPatientRuntimeValue(
  key: AuthenticatedRuntimeStringKey,
  organizationId: string | null = null,
): Promise<string> {
  return runtimeConfigProvider().getAuthenticatedString(key, organizationId);
}

export function getServerRuntimeBool(key: ServerRuntimeBooleanKey): Promise<boolean> {
  return runtimeConfigProvider().getServerBoolean(key);
}

export function getServerRuntimeInteger(
  key: ServerRuntimeIntegerKey,
  organizationId: string | null = null,
): Promise<number> {
  return runtimeConfigProvider().getServerInteger(key, organizationId);
}

export type ServerConfigStructuredKey = 'test_account_identifiers';

/**
 * Required structured server configuration. It shares the DB-only cache and failure semantics of
 * `getConfigValue`; malformed JSON is unavailable, never an implicit empty configuration.
 */
export async function getServerConfigStructuredValue(
  key: ServerConfigStructuredKey,
): Promise<unknown> {
  const value = await getConfigValue(key);
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new RuntimeSettingUnavailableError(key);
  }
}

/**
 * Fresh, fail-closed server authorization read. This deliberately bypasses
 * the 60-second compatibility cache and has no environment fallback.
 */
export function getFreshServerRuntimeTokenList(key: ServerRuntimeTokenListKey): Promise<string> {
  return runtimeConfigProvider().getServerTokenListStrict(key, 'auth_role_config');
}

/** Invalidate all cached entries (call after PATCH /api/admin/settings). */
export function invalidateConfigCache(): void {
  cache.clear();
}

/** Invalidate a single key from cache. */
export function invalidateConfigKey(key: string): void {
  for (const [cacheKey, entry] of cache) {
    if (entry.settingKey === key) cache.delete(cacheKey);
  }
}

/**
 * Two different things used to collapse into `null` here: "the database has no value for this key"
 * (an answer) and "the read never happened" (not an answer). The second one is what an anonymous
 * request gets on `system_settings` — a 42501 from the bare nonstaff login role — and caching it
 * poisoned the key for every consumer in the process for the whole TTL. They are now distinct.
 */
type SettingReadOutcome =
  | { read: true; value: string | null }
  | { read: false; cause: unknown };

async function fetchFromDb(key: string): Promise<SettingReadOutcome> {
  try {
    return { read: true, value: await currentConfigAdapterPort().readAdminSystemSettingString(key) };
  } catch (cause) {
    return { read: false, cause };
  }
}

async function fetchExactOrganizationValue(
  key: string,
  organizationId: string,
): Promise<SettingReadOutcome> {
  try {
    return {
      read: true,
      value: await currentConfigAdapterPort().readExactOrganizationAdminSystemSettingString(
        key,
        organizationId,
      ),
    };
  } catch (cause) {
    return { read: false, cause };
  }
}

function requireReadValue(key: string, outcome: SettingReadOutcome): string {
  if (!outcome.read) throw new RuntimeSettingUnavailableError(key, outcome.cause);
  if (outcome.value === null) throw new RuntimeSettingUnavailableError(key);
  return outcome.value;
}

/**
 * Get a required runtime config value from `system_settings`.
 * A failed read or missing row is not an answer and is never cached.
 */
export async function getConfigValue(key: string): Promise<string> {
  const now = Date.now();
  const identity = { kind: 'global', settingKey: key } as const;
  const cached = readCached(identity, now);
  if (cached !== null) return cached;

  const outcome = await fetchFromDb(key);
  const value = requireReadValue(key, outcome);
  writeCached(identity, value, now);
  return value;
}

/** Exact clinic row, intentionally without global fallback for connection credentials. */
export async function getExactOrganizationConfigValue(
  key: string,
  organizationId: string,
): Promise<string> {
  const normalizedOrganizationId = organizationId.trim();
  if (!normalizedOrganizationId) throw new RuntimeSettingUnavailableError(key);
  const identity = {
    kind: 'exact-organization',
    settingKey: key,
    organizationId: normalizedOrganizationId,
  } as const;
  const now = Date.now();
  const cached = readCached(identity, now);
  if (cached !== null) return cached;
  const outcome = await fetchExactOrganizationValue(key, normalizedOrganizationId);
  const value = requireReadValue(key, outcome);
  writeCached(identity, value, now);
  return value;
}

/**
 * Get a boolean config value (DB stores "true"/"false" or boolean).
 */
export async function getConfigBool(key: string): Promise<boolean> {
  const value = (await getConfigValue(key)).trim().toLowerCase();
  if (value === 'true' || value === '1') return true;
  if (value === 'false' || value === '0') return false;
  throw new RuntimeSettingUnavailableError(key);
}

/**
 * Required public capability read for an unauthenticated login request. Each accessor returns only
 * a derived boolean; a DB/accessor failure still propagates and must fail the request.
 */
export async function getPublicAuthChannelConfigured(
  channel: PublicAuthChannelCapability,
): Promise<boolean> {
  const settingKey =
    channel === 'email'
      ? 'smtp_outbound'
      : channel === 'sms'
        ? 'smsc_api_key'
        : channel === 'telegram'
          ? 'telegram_login_bot_username'
          : 'max_bot_api_key';
  const identity = {
    kind: 'auth-channel-configured',
    settingKey,
    channel,
  } as const satisfies CacheIdentity;
  const now = Date.now();
  const cached = readCached(identity, now);
  if (cached !== null) return cached === 'true';
  const dbValue = await currentConfigAdapterPort().readPublicAuthChannelConfigured(channel);
  writeCached(identity, dbValue ? 'true' : 'false', now);
  return dbValue;
}
