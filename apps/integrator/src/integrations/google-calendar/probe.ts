import { getGoogleCalendarConfig } from './runtimeConfig.js';
import type { GoogleCalendarConfig } from './config.js';

type TokenResponse = {
  access_token?: string;
};

/**
 * Минимальная read-only проба: refresh token + events.list maxResults=1.
 */
export async function probeGoogleCalendarAccess(
  fetchImpl: typeof fetch = globalThis.fetch,
  getConfig: () => Promise<GoogleCalendarConfig> = getGoogleCalendarConfig,
): Promise<void> {
  const config = await getConfig();
  if (!config.enabled) {
    throw new Error('not_configured');
  }
  if (!config.refreshToken?.trim() || !config.calendarId?.trim() || !config.clientId?.trim()) {
    throw new Error('not_configured');
  }

  const tokenRes = await fetchImpl('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: config.refreshToken,
      grant_type: 'refresh_token',
      redirect_uri: config.redirectUri,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!tokenRes.ok) {
    throw new Error(`GOOGLE_TOKEN_HTTP_${tokenRes.status}`);
  }
  const tokenJson = (await tokenRes.json()) as TokenResponse;
  const accessToken = tokenJson.access_token?.trim();
  if (!accessToken) {
    throw new Error('GOOGLE_TOKEN_MISSING');
  }

  const calendarId = encodeURIComponent(config.calendarId);
  const listUrl = `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events?maxResults=1&singleEvents=true`;
  const listRes = await fetchImpl(listUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!listRes.ok) {
    throw new Error(`GOOGLE_CALENDAR_HTTP_${listRes.status}`);
  }
}
