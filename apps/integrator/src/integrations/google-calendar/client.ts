import { googleCalendarConfig } from './config.js';

export type GoogleCalendarEventInput = {
  summary: string;
  description?: string;
  startDateTime: string;
  endDateTime: string;
};

export type GoogleCalendarClient = {
  upsertEvent: (googleEventId: string | null, event: GoogleCalendarEventInput) => Promise<string>;
  deleteEvent: (googleEventId: string) => Promise<void>;
};

type TokenResponse = {
  access_token?: string;
};

function eventBody(event: GoogleCalendarEventInput): Record<string, unknown> {
  return {
    summary: event.summary,
    ...(event.description ? { description: event.description } : {}),
    start: { dateTime: event.startDateTime },
    end: { dateTime: event.endDateTime },
  };
}

export function createGoogleCalendarClient(fetchImpl: typeof fetch = globalThis.fetch): GoogleCalendarClient {
  async function getAccessToken(): Promise<string> {
    const tokenRes = await fetchImpl('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: googleCalendarConfig.clientId,
        client_secret: googleCalendarConfig.clientSecret,
        refresh_token: googleCalendarConfig.refreshToken,
        grant_type: 'refresh_token',
        redirect_uri: googleCalendarConfig.redirectUri,
      }),
    });
    if (!tokenRes.ok) {
      throw new Error(`GOOGLE_TOKEN_HTTP_${tokenRes.status}`);
    }
    const tokenJson = (await tokenRes.json()) as TokenResponse;
    const accessToken = tokenJson.access_token?.trim();
    if (!accessToken) {
      throw new Error('GOOGLE_TOKEN_MISSING');
    }
    return accessToken;
  }

  async function upsertEvent(googleEventId: string | null, event: GoogleCalendarEventInput): Promise<string> {
    const accessToken = await getAccessToken();
    const calendarId = encodeURIComponent(googleCalendarConfig.calendarId);
    const isUpdate = typeof googleEventId === 'string' && googleEventId.trim().length > 0;
    const path = isUpdate
      ? `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${encodeURIComponent(googleEventId)}`
      : `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`;
    const method = isUpdate ? 'PATCH' : 'POST';
    const response = await fetchImpl(path, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(eventBody(event)),
    });
    if (!response.ok) {
      throw new Error(`GOOGLE_CALENDAR_HTTP_${response.status}`);
    }
    const json = (await response.json()) as { id?: string };
    if (!json.id) {
      throw new Error('GOOGLE_EVENT_ID_MISSING');
    }
    return json.id;
  }

  async function deleteEvent(googleEventId: string): Promise<void> {
    const accessToken = await getAccessToken();
    const calendarId = encodeURIComponent(googleCalendarConfig.calendarId);
    const response = await fetchImpl(
      `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${encodeURIComponent(googleEventId)}`,
      {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    );
    if (!response.ok && response.status !== 404) {
      throw new Error(`GOOGLE_CALENDAR_DELETE_HTTP_${response.status}`);
    }
  }

  return {
    upsertEvent,
    deleteEvent,
  };
}
