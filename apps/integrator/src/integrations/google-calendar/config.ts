export type GoogleCalendarConfig = {
  enabled: boolean;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  calendarId: string;
  refreshToken: string;
};

export function isGoogleCalendarConfigured(config: GoogleCalendarConfig): boolean {
  if (!config.enabled) return false;
  return (
    config.clientId.trim().length > 0 &&
    config.clientSecret.trim().length > 0 &&
    config.redirectUri.trim().length > 0 &&
    config.calendarId.trim().length > 0 &&
    config.refreshToken.trim().length > 0
  );
}
