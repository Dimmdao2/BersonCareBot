import { describe, expect, it } from 'vitest';
import {
  mapCanonicalStatus,
  normalizeLegacyStatus,
  parseSemicolonCsv,
  resolveNormalizedStatus,
} from './cutover-legacy-appointments';

describe('cutover legacy appointment primitives', () => {
  it('parses the owner semicolon CSV without breaking quoted separators', () => {
    expect(parseSemicolonCsv('\ufeff#;name;date\r\n42;"Иван; Иванов";14/07/2026\r\n')).toEqual([
      ['#', 'name', 'date'],
      ['42', 'Иван; Иванов', '14/07/2026'],
    ]);
  });

  it('uses the normalized provider status embedded in the legacy payload', () => {
    expect(resolveNormalizedStatus({ rubitime_normalized_status: 'completed' }, 'updated')).toBe(
      'completed',
    );
    expect(mapCanonicalStatus('updated', '', { rubitime_normalized_status: 'completed' })).toBe(
      'completed',
    );
  });

  it('preserves the historical cancellation attribution rules', () => {
    expect(mapCanonicalStatus('canceled', 'manual-cancel by staff', {})).toBe(
      'cancelled_by_specialist',
    );
    expect(mapCanonicalStatus('canceled', 'client cancel', {})).toBe('cancelled_by_patient');
  });

  it('normalizes numeric and Russian status forms used by the retired provider', () => {
    expect(normalizeLegacyStatus('3')).toBe('awaiting_prepayment');
    expect(normalizeLegacyStatus('', 'Ожидает подтверждения')).toBe('awaiting_confirmation');
    expect(normalizeLegacyStatus('unknown')).toBeNull();
  });
});
