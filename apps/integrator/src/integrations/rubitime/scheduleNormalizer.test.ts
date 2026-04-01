import { describe, expect, it } from 'vitest';
import { normalizeRubitimeSchedule } from './scheduleNormalizer.js';

const SAMPLE_SCHEDULE = {
  '2026-04-10': {
    '10:00': { available: true },
    '11:00': { available: false },
    '12:00': { available: true },
  },
  '2026-04-11': {
    '09:00': { available: true },
    '10:00': { available: false },
  },
};

describe('normalizeRubitimeSchedule', () => {
  it('converts available slots to BookingSlotsByDate[]', () => {
    const result = normalizeRubitimeSchedule(SAMPLE_SCHEDULE, 60);
    expect(result).toHaveLength(2);

    const day1 = result[0]!;
    expect(day1.date).toBe('2026-04-10');
    expect(day1.slots).toHaveLength(2);
    expect(day1.slots[0]!.startAt).toBe('2026-04-10T10:00:00');
    expect(day1.slots[1]!.startAt).toBe('2026-04-10T12:00:00');
  });

  it('computes endAt from durationMinutes', () => {
    const result = normalizeRubitimeSchedule({ '2026-04-10': { '10:00': { available: true } } }, 90);
    const slot = result[0]!.slots[0]!;
    expect(slot.startAt).toBe('2026-04-10T10:00:00');
    // 10:00 + 90min = 11:30
    expect(slot.endAt).toContain('T11:30:00');
  });

  it('skips unavailable slots', () => {
    const data = { '2026-04-10': { '10:00': { available: false }, '11:00': { available: false } } };
    const result = normalizeRubitimeSchedule(data, 60);
    expect(result).toHaveLength(0);
  });

  it('filters by dateFilter when provided', () => {
    const result = normalizeRubitimeSchedule(SAMPLE_SCHEDULE, 60, '2026-04-10');
    expect(result).toHaveLength(1);
    expect(result[0]!.date).toBe('2026-04-10');
  });

  it('returns empty array for empty schedule object', () => {
    expect(normalizeRubitimeSchedule({}, 60)).toEqual([]);
  });

  it('throws RUBITIME_SCHEDULE_MALFORMED_DATA for non-object data', () => {
    expect(() => normalizeRubitimeSchedule(null, 60)).toThrow('RUBITIME_SCHEDULE_MALFORMED_DATA');
    expect(() => normalizeRubitimeSchedule([], 60)).toThrow('RUBITIME_SCHEDULE_MALFORMED_DATA');
    expect(() => normalizeRubitimeSchedule('string', 60)).toThrow('RUBITIME_SCHEDULE_MALFORMED_DATA');
    expect(() => normalizeRubitimeSchedule(123, 60)).toThrow('RUBITIME_SCHEDULE_MALFORMED_DATA');
  });

  it('throws for null data', () => {
    expect(() => normalizeRubitimeSchedule(null, 60)).toThrow('RUBITIME_SCHEDULE_MALFORMED_DATA');
  });

  it('skips malformed date keys', () => {
    const data = {
      'not-a-date': { '10:00': { available: true } },
      '2026-04-10': { '10:00': { available: true } },
    };
    const result = normalizeRubitimeSchedule(data, 60);
    expect(result).toHaveLength(1);
    expect(result[0]!.date).toBe('2026-04-10');
  });

  it('sorts slots by startAt within a day', () => {
    const data = {
      '2026-04-10': {
        '14:00': { available: true },
        '09:00': { available: true },
        '11:00': { available: true },
      },
    };
    const result = normalizeRubitimeSchedule(data, 60);
    const times = result[0]!.slots.map((s) => s.startAt);
    expect(times).toEqual([...times].sort());
  });

  it('sorts result by date', () => {
    const data = {
      '2026-04-12': { '10:00': { available: true } },
      '2026-04-10': { '10:00': { available: true } },
      '2026-04-11': { '10:00': { available: true } },
    };
    const result = normalizeRubitimeSchedule(data, 60);
    const dates = result.map((r) => r.date);
    expect(dates).toEqual(['2026-04-10', '2026-04-11', '2026-04-12']);
  });
});
