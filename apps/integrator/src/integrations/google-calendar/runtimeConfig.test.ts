import { describe, it, expect, vi, beforeEach } from 'vitest';

const queryMock = vi.fn();
vi.mock('../../infra/db/client.js', () => ({
  createDbPort: () => ({ query: queryMock }),
}));

vi.mock('./config.js', () => ({
  googleCalendarConfig: {
    enabled: false,
    clientId: 'env-cid',
    clientSecret: 'env-csec',
    redirectUri: 'env-ruri',
    calendarId: 'env-cal',
    refreshToken: 'env-rt',
  },
}));

vi.mock('../../infra/observability/logger.js', () => ({
  logger: { warn: vi.fn() },
}));

import { getGoogleCalendarConfig, invalidateGoogleCalendarConfigCache } from './runtimeConfig.js';

const ORGANIZATION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function dbRow(key: string, value: unknown) {
  return { rows: [{ value_json: { value } }] };
}

function emptyResult() {
  return { rows: [] };
}

describe('getGoogleCalendarConfig', () => {
  beforeEach(() => {
    invalidateGoogleCalendarConfigCache();
    queryMock.mockReset();
  });

  it('returns env fallback when DB is empty', async () => {
    queryMock.mockResolvedValue(emptyResult());
    const config = await getGoogleCalendarConfig(ORGANIZATION_ID);
    expect(config.clientId).toBe('env-cid');
    expect(config.enabled).toBe(false);
  });

  it('returns DB values when available', async () => {
    queryMock.mockImplementation((_sql: string, params: unknown[]) => {
      const key = String((params as string[])[0]);
      const map: Record<string, unknown> = {
        google_calendar_enabled: 'true',
        platform_integration_availability: JSON.stringify({
          version: 1,
          integrations: { google_calendar: true },
        }),
        google_client_id: 'db-cid',
        google_client_secret: 'db-csec',
        google_redirect_uri: 'db-ruri',
        google_calendar_id: 'db-cal',
        google_refresh_token: 'db-rt',
      };
      return Promise.resolve(key in map ? dbRow(key, map[key] as string) : emptyResult());
    });
    const config = await getGoogleCalendarConfig(ORGANIZATION_ID);
    expect(config.enabled).toBe(true);
    expect(config.clientId).toBe('db-cid');
    expect(config.calendarId).toBe('db-cal');
    expect(config.refreshToken).toBe('db-rt');
  });

  it('does not fall back to an env calendar connection when this clinic has no rows', async () => {
    queryMock.mockImplementation((_sql: string, params: unknown[]) => {
      const key = String((params as string[])[0]);
      if (key === 'google_client_id') {
        return Promise.resolve(dbRow(key, 'db-only-cid'));
      }
      return Promise.resolve(emptyResult());
    });
    const config = await getGoogleCalendarConfig(ORGANIZATION_ID);
    expect(config.clientId).toBe('db-only-cid');
    expect(config.clientSecret).toBe('env-csec');
    expect(config.refreshToken).toBe('');
    expect(config.calendarId).toBe('');
    expect(config.enabled).toBe(false);
  });

  it('uses DB for enabled when other credential keys are only in env', async () => {
    queryMock.mockImplementation((_sql: string, params: unknown[]) => {
      const key = String((params as string[])[0]);
      if (key === 'google_calendar_enabled') {
        return Promise.resolve(dbRow(key, 'true'));
      }
      if (key === 'platform_integration_availability') {
        return Promise.resolve(dbRow(key, JSON.stringify({ version: 1, integrations: { google_calendar: true } })));
      }
      return Promise.resolve(emptyResult());
    });
    const config = await getGoogleCalendarConfig(ORGANIZATION_ID);
    expect(config.enabled).toBe(true);
    expect(config.clientId).toBe('env-cid');
  });

  it('disables a configured clinic when the platform switch is absent or malformed', async () => {
    queryMock.mockImplementation((_sql: string, params: unknown[]) => {
      const key = String((params as string[])[0]);
      const map: Record<string, unknown> = {
        google_calendar_enabled: 'true',
        google_calendar_id: 'db-cal',
        google_refresh_token: 'db-rt',
      };
      return Promise.resolve(key in map ? dbRow(key, map[key] as string) : emptyResult());
    });
    const config = await getGoogleCalendarConfig(ORGANIZATION_ID);
    expect(config.enabled).toBe(false);
  });

  it('caches result and reuses without DB query', async () => {
    queryMock.mockResolvedValue(emptyResult());
    await getGoogleCalendarConfig(ORGANIZATION_ID);
    const callCount = queryMock.mock.calls.length;
    await getGoogleCalendarConfig(ORGANIZATION_ID);
    expect(queryMock.mock.calls.length).toBe(callCount);
  });

  it('invalidateGoogleCalendarConfigCache forces re-read', async () => {
    queryMock.mockResolvedValue(emptyResult());
    await getGoogleCalendarConfig(ORGANIZATION_ID);
    const callCount = queryMock.mock.calls.length;
    invalidateGoogleCalendarConfigCache();
    await getGoogleCalendarConfig(ORGANIZATION_ID);
    expect(queryMock.mock.calls.length).toBeGreaterThan(callCount);
  });
});
