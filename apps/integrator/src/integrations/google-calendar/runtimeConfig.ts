import { getAdminSettingBoolean, getAdminSettingString } from '../../infra/db/repos/adminRuntimeConfig.js';
import { env } from '../../config/env.js';
import type { GoogleCalendarConfig } from './config.js';

export async function getGoogleCalendarConfig(): Promise<GoogleCalendarConfig> {
  const [
    enabled,
    clientId,
    clientSecret,
    redirectUri,
    calendarId,
    refreshToken,
  ] = await Promise.all([
    getAdminSettingBoolean('google_calendar_enabled', env.GOOGLE_CALENDAR_ENABLED),
    getAdminSettingString('google_client_id', env.GOOGLE_CLIENT_ID),
    getAdminSettingString('google_client_secret', env.GOOGLE_CLIENT_SECRET),
    getAdminSettingString('google_redirect_uri', env.GOOGLE_REDIRECT_URI),
    getAdminSettingString('google_calendar_id', env.GOOGLE_CALENDAR_ID),
    getAdminSettingString('google_refresh_token', env.GOOGLE_REFRESH_TOKEN),
  ]);

  return {
    enabled,
    clientId,
    clientSecret,
    redirectUri,
    calendarId,
    refreshToken,
  };
}
