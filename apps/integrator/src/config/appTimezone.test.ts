import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DbPort } from '../kernel/contracts/index.js';
import { formatBookingRuDateTime } from '../integrations/rubitime/bookingNotificationFormat.js';
import { logger } from '../infra/observability/logger.js';
import {
  formatIsoInstantAsRubitimeRecordLocal,
  getAppDisplayTimezone,
  getAppDisplayTimezoneSync,
  getRubitimeRecordAtUtcOffsetMinutesForInstant,
  resetAppDisplayTimezoneCacheForTests,
  resetAppDisplayTimezoneSyncWarnForTests,
} from './appTimezone.js';

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

describe('Rubitime record local time formatting', () => {
  it('maps UTC instant to Europe/Moscow wall time (incident: 08:00Z → 11:00 local)', () => {
    expect(formatIsoInstantAsRubitimeRecordLocal('2026-04-07T08:00:00.000Z', 'Europe/Moscow')).toBe(
      '2026-04-07 11:00:00',
    );
  });

  it('does not double-shift when ISO already has offset (same instant as UTC)', () => {
    expect(formatIsoInstantAsRubitimeRecordLocal('2026-04-07T11:00:00+03:00', 'Europe/Moscow')).toBe(
      '2026-04-07 11:00:00',
    );
  });

  it('throws on invalid input', () => {
    expect(() => formatIsoInstantAsRubitimeRecordLocal('not-a-date', 'Europe/Moscow')).toThrow('invalid_slot_start');
  });
});

describe('getAppDisplayTimezone (DB source)', () => {
  afterEach(() => {
    resetAppDisplayTimezoneCacheForTests();
    recordIncidentMock.mockClear();
    vi.useRealTimers();
  });

  it('returns Europe/Samara from system_settings and caches for TTL', async () => {
    vi.useFakeTimers({ now: 0 });
    const query = vi.fn().mockResolvedValue({
      rows: [{ value_json: { value: 'Europe/Samara' } }],
    });
    const db = mockDb(query);

    const a = await getAppDisplayTimezone({ db });
    const b = await getAppDisplayTimezone({ db });
    expect(a).toBe('Europe/Samara');
    expect(b).toBe('Europe/Samara');
    expect(query).toHaveBeenCalledTimes(1);
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
    vi.useFakeTimers({ now: 0 });
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
    vi.useFakeTimers({ now: 0 });
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
    vi.useFakeTimers({ now: 0 });
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

  it('Rubitime UTC offset follows DB-backed display IANA zone', async () => {
    resetAppDisplayTimezoneCacheForTests();
    const query = vi.fn().mockResolvedValue({
      rows: [{ value_json: { value: 'Europe/Samara' } }],
    });
    const db = mockDb(query);
    const instant = new Date('2026-06-01T12:00:00.000Z');
    const minutes = await getRubitimeRecordAtUtcOffsetMinutesForInstant({ db, instant });
    expect(minutes).toBe(240);
  });
});

describe('legacy env display timezone helper', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    resetAppDisplayTimezoneSyncWarnForTests();
  });

  it('logs warn when legacy env vars are set', () => {
    vi.stubEnv('APP_DISPLAY_TIMEZONE', 'Europe/Samara');
    const spy = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    expect(getAppDisplayTimezoneSync()).toBe('Europe/Samara');
    expect(spy).toHaveBeenCalled();
    const msg = String(spy.mock.calls[0]?.[1] ?? '');
    expect(msg).toContain('system_settings');
    spy.mockRestore();
  });
});
