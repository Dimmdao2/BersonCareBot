import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DbPort } from '../../../kernel/contracts/ports.js';
import {
  DEFAULT_BOOKING_DISPLAY_TIMEZONE,
  getBookingDisplayTimezone,
  resetBookingDisplayTimezoneCache,
} from './bookingDisplayTimezone.js';

describe('getBookingDisplayTimezone', () => {
  beforeEach(() => {
    resetBookingDisplayTimezoneCache();
  });

  it('returns string from value_json.value when valid', async () => {
    const db: DbPort = {
      query: vi.fn().mockResolvedValue({
        rows: [{ value_json: { value: 'Europe/Kiev' } }],
      }),
      tx: vi.fn(),
    };
    const tz = await getBookingDisplayTimezone(db);
    expect(tz).toBe('Europe/Kiev');
  });

  it('returns default when row missing', async () => {
    const db: DbPort = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
      tx: vi.fn(),
    };
    const tz = await getBookingDisplayTimezone(db);
    expect(tz).toBe(DEFAULT_BOOKING_DISPLAY_TIMEZONE);
  });

  it('returns default when value fails IANA-like pattern', async () => {
    const db: DbPort = {
      query: vi.fn().mockResolvedValue({
        rows: [{ value_json: { value: 'not a zone!!!' } }],
      }),
      tx: vi.fn(),
    };
    const tz = await getBookingDisplayTimezone(db);
    expect(tz).toBe(DEFAULT_BOOKING_DISPLAY_TIMEZONE);
  });

  it('returns default on query error', async () => {
    const db: DbPort = {
      query: vi.fn().mockRejectedValue(new Error('db down')),
      tx: vi.fn(),
    };
    const tz = await getBookingDisplayTimezone(db);
    expect(tz).toBe(DEFAULT_BOOKING_DISPLAY_TIMEZONE);
  });

  it('uses cache within TTL (single query)', async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [{ value_json: { value: 'Europe/Moscow' } }],
    });
    const db: DbPort = { query, tx: vi.fn() };
    await getBookingDisplayTimezone(db);
    await getBookingDisplayTimezone(db);
    expect(query).toHaveBeenCalledTimes(1);
  });
});
