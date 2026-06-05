/**
 * Google Calendar runtime config: DB-backed (`public.system_settings`, admin scope)
 * with env fallback for backward compatibility during rollout.
 */
import { createDbPort } from '../../infra/db/client.js';
import { googleCalendarConfig, type GoogleCalendarConfig } from './config.js';
import { logger } from '../../infra/observability/logger.js';
import { readPublicSystemSettingString } from '../../infra/db/publicSystemSettings.js';

const TTL_MS = 60_000;
type CacheEntry = { config: GoogleCalendarConfig; expiresAt: number };
let configCache: CacheEntry | null = null;

export function invalidateGoogleCalendarConfigCache(): void {
  configCache = null;
}

async function readDbSetting(key: string): Promise<string | null> {
  try {
    const db = createDbPort();
    return await readPublicSystemSettingString(db, key);
  } catch {
    return null;
  }
}

/**
 * Merge DB `system_settings` with env: each field uses DB when a row exists with a
 * non-empty parsed value; otherwise env. Avoids replacing a full env config with
 * empty strings when only part of the keys were synced to integrator DB.
 */
async function mergeConfigFromDbWithEnv(env: GoogleCalendarConfig): Promise<GoogleCalendarConfig> {
  try {
    const [enabledRaw, clientId, clientSecret, redirectUri, calendarId, refreshToken] = await Promise.all([
      readDbSetting('google_calendar_enabled'),
      readDbSetting('google_client_id'),
      readDbSetting('google_client_secret'),
      readDbSetting('google_redirect_uri'),
      readDbSetting('google_calendar_id'),
      readDbSetting('google_refresh_token'),
    ]);
    return {
      enabled:
        enabledRaw !== null ? enabledRaw === 'true' || enabledRaw === '1' : env.enabled,
      clientId: clientId ?? env.clientId,
      clientSecret: clientSecret ?? env.clientSecret,
      redirectUri: redirectUri ?? env.redirectUri,
      calendarId: calendarId ?? env.calendarId,
      refreshToken: refreshToken ?? env.refreshToken,
    };
  } catch (err) {
    logger.warn({ err }, '[google-calendar] failed to read config from DB, using env only');
    return env;
  }
}

/** @deprecated env fallback — use DB (system_settings admin) via webapp Settings UI */
const envFallback = googleCalendarConfig;

export async function getGoogleCalendarConfig(): Promise<GoogleCalendarConfig> {
  const now = Date.now();
  if (configCache && configCache.expiresAt > now) {
    return configCache.config;
  }
  const resolved = await mergeConfigFromDbWithEnv(envFallback);
  configCache = { config: resolved, expiresAt: now + TTL_MS };
  return resolved;
}
