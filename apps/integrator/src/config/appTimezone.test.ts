import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DbPort } from '../kernel/contracts/index.js';
import { formatBookingRuDateTime } from '../integrations/bersoncare/bookingNotificationFormat.js';
import { getAppDisplayTimezone } from './appTimezone.js';

const recordIncidentMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock('../infra/db/dataQualityIncidentAlert.js', () => ({
  recordDataQualityIncidentAndMaybeTelegram: recordIncidentMock,
}));

function mockDb(query: DbPort['query']): DbPort {
  const db: DbPort = {
    query,
    async tx(fn) {
      return fn(db);
    },
  };
  return db;
}

describe('getAppDisplayTimezone (DB source)', () => {
  afterEach(() => {
    recordIncidentMock.mockClear();
  });

  it('returns the current system_settings value on every call', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [{ value_json: { value: 'Europe/Samara' } }],
      })
      .mockResolvedValueOnce({
        rows: [{ value_json: { value: 'Europe/Moscow' } }],
      });
    const db = mockDb(query);

    const a = await getAppDisplayTimezone({ db });
    const b = await getAppDisplayTimezone({ db });
    expect(a).toBe('Europe/Samara');
    expect(b).toBe('Europe/Moscow');
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[0]![0]).toContain('system_settings');
    expect(query.mock.calls[0]![1]).toEqual(['app_display_timezone', 'admin']);
    expect(recordIncidentMock).not.toHaveBeenCalled();
  });

  it('booking message formatting uses Samara (+4) vs Moscow (+3) for same UTC instant', () => {
    const iso = '2026-06-01T12:00:00.000Z';
    const msk = formatBookingRuDateTime(iso, 'Europe/Moscow');
    const sam = formatBookingRuDateTime(iso, 'Europe/Samara');
    expect(msk).not.toBe(sam);
    expect(sam).toMatch(/16[.:]00/);
    expect(msk).toMatch(/15[.:]00/);
  });

  it('falls back to Europe/Moscow and records incident when setting is missing', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const db = mockDb(query);

    const tz = await getAppDisplayTimezone({ db });
    expect(tz).toBe('Europe/Moscow');
    expect(recordIncidentMock).toHaveBeenCalledTimes(1);
    expect(recordIncidentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        incident: expect.objectContaining({
          errorReason: 'missing_or_empty',
          field: 'app_display_timezone',
        }),
      }),
    );
  });

  it('records incident with invalid_iana when value fails ICU', async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [{ value_json: { value: 'Foo/Bar' } }],
    });
    const db = mockDb(query);
    const tz = await getAppDisplayTimezone({ db });
    expect(tz).toBe('Europe/Moscow');
    expect(recordIncidentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        incident: expect.objectContaining({
          errorReason: 'invalid_iana',
          rawValue: 'Foo/Bar',
        }),
      }),
    );
  });

  it('records incident with query_failed when DB throws', async () => {
    const query = vi.fn().mockRejectedValue(new Error('db unavailable'));
    const db = mockDb(query);
    const tz = await getAppDisplayTimezone({ db });
    expect(tz).toBe('Europe/Moscow');
    expect(recordIncidentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        incident: expect.objectContaining({
          errorReason: 'query_failed',
        }),
      }),
    );
  });
});
