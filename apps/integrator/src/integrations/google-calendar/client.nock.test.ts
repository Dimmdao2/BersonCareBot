import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import nock from 'nock';

vi.mock('./config.js', () => ({
  googleCalendarConfig: {
    enabled: true,
    clientId: 'test-client-id',
    clientSecret: 'test-client-secret',
    redirectUri: 'http://localhost/oauth',
    calendarId: 'cal-test-id',
    refreshToken: 'test-refresh-token',
  },
  isGoogleCalendarConfigured: () => true,
}));

import { createGoogleCalendarClient } from './client.js';

const sampleEvent = {
  summary: 'Test',
  startDateTime: '2026-01-15T08:00:00Z',
  endDateTime: '2026-01-15T09:00:00Z',
};

describe('Google Calendar client (nock)', () => {
  beforeEach(() => {
    nock.disableNetConnect();
  });

  afterEach(() => {
    nock.cleanAll();
    nock.enableNetConnect();
  });

  it('token refresh success then POST create event', async () => {
    nock('https://oauth2.googleapis.com').post('/token').reply(200, { access_token: 'access-1' });
    nock('https://www.googleapis.com')
      .post(/\/calendar\/v3\/calendars\/[^/]+\/events$/)
      .reply(200, { id: 'evt-created' });

    const client = createGoogleCalendarClient();
    const id = await client.upsertEvent(null, sampleEvent);
    expect(id).toBe('evt-created');
  });

  it('token refresh failure does not call Calendar API', async () => {
    nock('https://oauth2.googleapis.com').post('/token').reply(400, { error: 'invalid_grant' });

    const client = createGoogleCalendarClient();
    await expect(client.upsertEvent(null, sampleEvent)).rejects.toThrow(/GOOGLE_TOKEN_HTTP_400/);
  });

  it('token refresh success then PATCH update event', async () => {
    nock('https://oauth2.googleapis.com').post('/token').reply(200, { access_token: 'access-2' });
    nock('https://www.googleapis.com')
      .patch(/\/calendar\/v3\/calendars\/[^/]+\/events\/evt-patch-1$/)
      .reply(200, { id: 'evt-patch-1' });

    const client = createGoogleCalendarClient();
    const id = await client.upsertEvent('evt-patch-1', sampleEvent);
    expect(id).toBe('evt-patch-1');
  });

  it('DELETE tolerates 404 (idempotent delete)', async () => {
    nock('https://oauth2.googleapis.com').post('/token').reply(200, { access_token: 'access-3' });
    nock('https://www.googleapis.com')
      .delete(/\/calendar\/v3\/calendars\/[^/]+\/events\/missing-event$/)
      .reply(404);

    const client = createGoogleCalendarClient();
    await expect(client.deleteEvent('missing-event')).resolves.toBeUndefined();
  });

  it('DELETE non-404 error throws', async () => {
    nock('https://oauth2.googleapis.com').post('/token').reply(200, { access_token: 'access-4' });
    nock('https://www.googleapis.com')
      .delete(/\/calendar\/v3\/calendars\/[^/]+\/events\/bad-event$/)
      .reply(500);

    const client = createGoogleCalendarClient();
    await expect(client.deleteEvent('bad-event')).rejects.toThrow(/GOOGLE_CALENDAR_DELETE_HTTP_500/);
  });
});
