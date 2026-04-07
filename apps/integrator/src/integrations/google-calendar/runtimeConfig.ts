/**
 * Google Calendar runtime config: DB-backed (`system_settings`, admin scope)
 * with env fallback for backward compatibility during rollout.
 */
import { createDbPort } from '../../infra/db/client.js';
import { googleCalendarConfig, type GoogleCalendarConfig } from './config.js';
import { logger } from '../../infra/observability/logger.js';

const TTL_MS = 60_000;
type CacheEntry = { config: GoogleCalendarConfig; expiresAt: number };
let configCache: CacheEntry | null = null;

export function invalidateGoogleCalendarConfigCache(): void {
  configCache = null;
}

function parseSettingsValue(valueJson: unknown): string | null {
  if (valueJson !== null && typeof valueJson === 'object' && 'value' in valueJson) {
    const v = (valueJson as Record<string, unknown>).value;
    if (typeof v === 'string') return v.trim() || null;
    if (typeof v === 'boolean') return v ? 'true' : 'false';
    if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  }
  return null;
}

async function readDbSetting(key: string): Promise<string | null> {
  try {
    const db = createDbPort();
    const res = await db.query<{ value_json: unknown }>(
      `SELECT value_json FROM system_settings WHERE key = $1 AND scope = 'admin' LIMIT 1`,
      [key],
    );
    if (!res.rows[0]) return null;
    return parseSettingsValue(res.rows[0].value_json);
  } catch {
    return null;
  }
}

async function loadConfigFromDb(): Promise<GoogleCalendarConfig | null> {
  try {
    const [enabledRaw, clientId, clientSecret, redirectUri, calendarId, refreshToken] = await Promise.all([
      readDbSetting('google_calendar_enabled'),
      readDbSetting('google_client_id'),
      readDbSetting('google_client_secret'),
      readDbSetting('google_redirect_uri'),
      readDbSetting('google_calendar_id'),
      readDbSetting('google_refresh_token'),
    ]);
    const hasAnyDbValue = [clientId, clientSecret, redirectUri, calendarId, refreshToken].some((v) => v !== null);
    if (!hasAnyDbValue && enabledRaw === null) return null;
    return {
      enabled: enabledRaw === 'true' || enabledRaw === '1',
      clientId: clientId ?? '',
      clientSecret: clientSecret ?? '',
      redirectUri: redirectUri ?? '',
      calendarId: calendarId ?? '',
      refreshToken: refreshToken ?? '',
    };
  } catch (err) {
    logger.warn({ err }, '[google-calendar] failed to read config from DB, falling back to env');
    return null;
  }
}

/** @deprecated env fallback — use DB (system_settings admin) via webapp Settings UI */
const envFallback = googleCalendarConfig;

export async function getGoogleCalendarConfig(): Promise<GoogleCalendarConfig> {
  const now = Date.now();
  if (configCache && configCache.expiresAt > now) {
    return configCache.config;
  }
  const dbConfig = await loadConfigFromDb();
  const resolved = dbConfig ?? envFallback;
  configCache = { config: resolved, expiresAt: now + TTL_MS };
  return resolved;
}
