import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_BOOKING_DISPLAY_TIMEZONE,
  getBookingDisplayTimezone,
  resetBookingDisplayTimezoneCache,
} from './bookingDisplayTimezone.js';

vi.mock('../../../config/env.js', () => ({
  env: { BOOKING_DISPLAY_TIMEZONE: 'Europe/Moscow' },
}));

import { env } from '../../../config/env.js';

describe('getBookingDisplayTimezone', () => {
  beforeEach(() => {
    resetBookingDisplayTimezoneCache();
    vi.clearAllMocks();
  });

  it('returns valid timezone from env', async () => {
    (env as Record<string, unknown>).BOOKING_DISPLAY_TIMEZONE = 'Europe/Kiev';
    const tz = await getBookingDisplayTimezone();
    expect(tz).toBe('Europe/Kiev');
  });

  it('returns default when env is missing', async () => {
    (env as Record<string, unknown>).BOOKING_DISPLAY_TIMEZONE = '';
    const tz = await getBookingDisplayTimezone();
    expect(tz).toBe(DEFAULT_BOOKING_DISPLAY_TIMEZONE);
  });

  it('returns default when env fails IANA-like pattern', async () => {
    (env as Record<string, unknown>).BOOKING_DISPLAY_TIMEZONE = 'not a zone!!!';
    const tz = await getBookingDisplayTimezone();
    expect(tz).toBe(DEFAULT_BOOKING_DISPLAY_TIMEZONE);
  });

  it('ignores db argument (backward compat)', async () => {
    (env as Record<string, unknown>).BOOKING_DISPLAY_TIMEZONE = 'Asia/Yekaterinburg';
    const tz = await getBookingDisplayTimezone({ query: vi.fn(), tx: vi.fn() });
    expect(tz).toBe('Asia/Yekaterinburg');
  });
});
