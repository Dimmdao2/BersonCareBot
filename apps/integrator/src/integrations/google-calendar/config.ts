import { env } from '../../config/env.js';

export type GoogleCalendarConfig = {
  enabled: boolean;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  calendarId: string;
  refreshToken: string;
};

export const googleCalendarConfig: GoogleCalendarConfig = {
  enabled: env.GOOGLE_CALENDAR_ENABLED,
  clientId: env.GOOGLE_CLIENT_ID,
  clientSecret: env.GOOGLE_CLIENT_SECRET,
  redirectUri: env.GOOGLE_REDIRECT_URI,
  calendarId: env.GOOGLE_CALENDAR_ID,
  refreshToken: env.GOOGLE_REFRESH_TOKEN,
};

export function isGoogleCalendarConfigured(config: GoogleCalendarConfig = googleCalendarConfig): boolean {
  if (!config.enabled) return false;
  return (
    config.clientId.trim().length > 0
    && config.clientSecret.trim().length > 0
    && config.redirectUri.trim().length > 0
    && config.calendarId.trim().length > 0
    && config.refreshToken.trim().length > 0
  );
}
