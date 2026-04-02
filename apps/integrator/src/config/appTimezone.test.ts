import { describe, expect, it } from 'vitest';
import { formatIsoInstantAsRubitimeRecordLocal } from './appTimezone.js';

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
