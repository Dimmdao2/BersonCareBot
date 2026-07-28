/**
 * Google Calendar runtime config: DB-backed (`public.system_settings`, admin scope)
 * with env fallback for backward compatibility during rollout.
 */
import { createDbPort } from '../../infra/db/client.js';
import { googleCalendarConfig, type GoogleCalendarConfig } from './config.js';
import { logger } from '../../infra/observability/logger.js';
import {
  readExactOrganizationPublicSystemSettingString,
  readPublicSystemSettingString,
} from '../../infra/db/publicSystemSettings.js';

const TTL_MS = 60_000;
type CacheEntry = { config: GoogleCalendarConfig; expiresAt: number };
const configCache = new Map<string, CacheEntry>();

export function invalidateGoogleCalendarConfigCache(organizationId?: string): void {
  if (organizationId?.trim()) configCache.delete(organizationId.trim());
  else configCache.clear();
}

async function readDbSetting(key: string, organizationId: string | null = null): Promise<string | null> {
  try {
    const db = createDbPort();
    return await readPublicSystemSettingString(db, key, 'admin', { organizationId });
  } catch {
    return null;
  }
}

function isGoogleCalendarPlatformAvailable(raw: string | null): boolean {
  if (!raw) return false;
  try {
    const value = JSON.parse(raw) as { version?: unknown; integrations?: { google_calendar?: unknown } };
    return value.version === 1 && value.integrations?.google_calendar === true;
  } catch {
    return false;
  }
}

/**
 * Platform OAuth identity keeps its bounded legacy env fallback. Clinic-owned connection
 * values are exact organization rows and never inherit an env or global setting.
 */
async function mergeConfigFromDbWithEnv(
  env: GoogleCalendarConfig,
  organizationId: string,
): Promise<GoogleCalendarConfig> {
  try {
    const db = createDbPort();
    const [enabledRaw, clientId, clientSecret, redirectUri, calendarId, refreshToken, availability] = await Promise.all([
      readExactOrganizationPublicSystemSettingString(db, 'google_calendar_enabled', organizationId),
      readDbSetting('google_client_id'),
      readDbSetting('google_client_secret'),
      readDbSetting('google_redirect_uri'),
      readExactOrganizationPublicSystemSettingString(db, 'google_calendar_id', organizationId),
      readExactOrganizationPublicSystemSettingString(db, 'google_refresh_token', organizationId),
      readDbSetting('platform_integration_availability'),
    ]);
    return {
      enabled:
        isGoogleCalendarPlatformAvailable(availability) &&
        (enabledRaw !== null ? enabledRaw === 'true' || enabledRaw === '1' : false),
      clientId: clientId ?? env.clientId,
      clientSecret: clientSecret ?? env.clientSecret,
      redirectUri: redirectUri ?? env.redirectUri,
      // A clinic connection must never inherit either value from another clinic or legacy env.
      calendarId: calendarId ?? '',
      refreshToken: refreshToken ?? '',
    };
  } catch (err) {
    logger.warn({ err }, '[google-calendar] failed to read clinic config from DB');
    return { ...env, enabled: false, calendarId: '', refreshToken: '' };
  }
}

/** @deprecated env fallback — use DB (system_settings admin) via webapp Settings UI */
const envFallback = googleCalendarConfig;

export async function getGoogleCalendarConfig(organizationId: string | null | undefined = null): Promise<GoogleCalendarConfig> {
  const normalizedOrganizationId = organizationId?.trim() ?? '';
  if (!normalizedOrganizationId) {
    return { ...envFallback, enabled: false, calendarId: '', refreshToken: '' };
  }
  const now = Date.now();
  const cached = configCache.get(normalizedOrganizationId);
  if (cached && cached.expiresAt > now) {
    return cached.config;
  }
  const resolved = await mergeConfigFromDbWithEnv(envFallback, normalizedOrganizationId);
  configCache.set(normalizedOrganizationId, { config: resolved, expiresAt: now + TTL_MS });
  return resolved;
}
