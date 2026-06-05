import { describe, expect, it } from 'vitest';
import { normalizeRubitimeUpdateRecordPatch } from './normalizeUpdateRecordPatch.js';

describe('normalizeRubitimeUpdateRecordPatch', () => {
  it('maps slotStart/slotEnd to record/datetime_end', () => {
    const out = normalizeRubitimeUpdateRecordPatch(
      {
        slotStart: '2026-06-01T09:00:00.000Z',
        slotEnd: '2026-06-01T10:00:00.000Z',
        branch_id: 17356,
      },
      'Europe/Moscow',
    );
    expect(out.record).toBeTruthy();
    expect(out.datetime_end).toBeTruthy();
    expect(out.branch_id).toBe(17356);
    expect(out).not.toHaveProperty('slotStart');
  });

  it('prefers explicit record/datetime_end over slot aliases', () => {
    const out = normalizeRubitimeUpdateRecordPatch(
      {
        record: '2026-06-01T09:00:00.000Z',
        datetime_end: '2026-06-01T10:00:00.000Z',
        slotStart: '2026-06-02T09:00:00.000Z',
      },
      'Europe/Moscow',
    );
    expect(out.record).not.toBe('2026-06-02T09:00:00.000Z');
  });
});
