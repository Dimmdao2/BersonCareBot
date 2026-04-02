import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_APP_DISPLAY_TIMEZONE,
  DEFAULT_BOOKING_DISPLAY_TIMEZONE,
  getAppDisplayTimezoneSync,
  getBookingDisplayTimezone,
  resetBookingDisplayTimezoneCache,
  utcOffsetMinutesFromLongOffset,
} from './appTimezone.js';

vi.mock('./env.js', () => ({
  env: {
    APP_DISPLAY_TIMEZONE: '',
    BOOKING_DISPLAY_TIMEZONE: 'Europe/Moscow',
    RUBITIME_RECORD_AT_UTC_OFFSET_MINUTES: undefined,
  },
}));

import { env } from './env.js';

describe('appTimezone', () => {
  beforeEach(() => {
    resetBookingDisplayTimezoneCache();
    vi.clearAllMocks();
    (env as Record<string, unknown>).APP_DISPLAY_TIMEZONE = '';
    (env as Record<string, unknown>).BOOKING_DISPLAY_TIMEZONE = 'Europe/Moscow';
    (env as Record<string, unknown>).RUBITIME_RECORD_AT_UTC_OFFSET_MINUTES = undefined;
  });

  it('deprecated booking default alias matches app default', () => {
    expect(DEFAULT_BOOKING_DISPLAY_TIMEZONE).toBe(DEFAULT_APP_DISPLAY_TIMEZONE);
  });

  it('getBookingDisplayTimezone returns valid timezone from BOOKING_DISPLAY_TIMEZONE', async () => {
    (env as Record<string, unknown>).BOOKING_DISPLAY_TIMEZONE = 'Europe/Kiev';
    const tz = await getBookingDisplayTimezone();
    expect(tz).toBe('Europe/Kiev');
  });

  it('APP_DISPLAY_TIMEZONE wins over BOOKING_DISPLAY_TIMEZONE', () => {
    (env as Record<string, unknown>).APP_DISPLAY_TIMEZONE = 'Asia/Yekaterinburg';
    (env as Record<string, unknown>).BOOKING_DISPLAY_TIMEZONE = 'Europe/Moscow';
    expect(getAppDisplayTimezoneSync()).toBe('Asia/Yekaterinburg');
  });

  it('returns default when both env values are empty', () => {
    (env as Record<string, unknown>).APP_DISPLAY_TIMEZONE = '';
    (env as Record<string, unknown>).BOOKING_DISPLAY_TIMEZONE = '';
    const tz = getAppDisplayTimezoneSync();
    expect(tz).toBe(DEFAULT_APP_DISPLAY_TIMEZONE);
  });

  it('returns default when env fails IANA-like pattern', () => {
    (env as Record<string, unknown>).BOOKING_DISPLAY_TIMEZONE = 'not a zone!!!';
    const tz = getAppDisplayTimezoneSync();
    expect(tz).toBe(DEFAULT_APP_DISPLAY_TIMEZONE);
  });

  it('when APP is invalid IANA, falls back to valid BOOKING', () => {
    (env as Record<string, unknown>).APP_DISPLAY_TIMEZONE = 'not a zone!!!';
    (env as Record<string, unknown>).BOOKING_DISPLAY_TIMEZONE = 'Europe/Kiev';
    expect(getAppDisplayTimezoneSync()).toBe('Europe/Kiev');
  });

  it('ignores db argument on getBookingDisplayTimezone (backward compat)', async () => {
    (env as Record<string, unknown>).BOOKING_DISPLAY_TIMEZONE = 'Asia/Yekaterinburg';
    const tz = await getBookingDisplayTimezone({ query: vi.fn(), tx: vi.fn() });
    expect(tz).toBe('Asia/Yekaterinburg');
  });

  it('utcOffsetMinutesFromLongOffset returns ~180 for Europe/Moscow in 2026', () => {
    const m = utcOffsetMinutesFromLongOffset('Europe/Moscow', new Date('2026-04-02T12:00:00.000Z'));
    expect(m).toBe(180);
  });
});
