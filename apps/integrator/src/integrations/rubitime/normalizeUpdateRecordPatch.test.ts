import { describe, expect, it } from 'vitest';
/* eslint-disable no-secrets/no-secrets -- import path matches module filename */
import {
  isRubitimeUpdateRecordPatchEmpty,
  normalizeRubitimeUpdateRecordPatch,
} from './normalizeUpdateRecordPatch.js';

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

  it('normalizes string numeric status', () => {
    const out = normalizeRubitimeUpdateRecordPatch({ status: '4' }, 'Europe/Moscow');
    expect(out.status).toBe(4);
  });

  it('detects empty patch', () => {
    expect(isRubitimeUpdateRecordPatchEmpty({})).toBe(true);
    expect(isRubitimeUpdateRecordPatchEmpty({ status: 4 })).toBe(false);
  });

  // R3: time-only reschedule — normalized patch has record/datetime_end but NO status
  it('R3: time-only reschedule patch normalizes to record/datetime_end with no status field', () => {
    const out = normalizeRubitimeUpdateRecordPatch(
      {
        record: '2026-06-02T11:00:00.000Z',
        datetime_end: '2026-06-02T12:00:00.000Z',
        // no status key — this is a time-only change
      },
      'Europe/Moscow',
    );
    expect(out.record).toBeTruthy();
    expect(out.datetime_end).toBeTruthy();
    // A time-only patch must NOT introduce a status field into the Rubitime API call
    expect(out).not.toHaveProperty('status');
    expect(isRubitimeUpdateRecordPatchEmpty(out)).toBe(false);
  });

  // X1: cancel patch normalizes to status=4 only (no time fields)
  it('X1: cancel patch normalizes to {status:4} with no record or datetime_end', () => {
    const out = normalizeRubitimeUpdateRecordPatch({ status: 4 }, 'Europe/Moscow');
    expect(out.status).toBe(4);
    expect(out).not.toHaveProperty('record');
    expect(out).not.toHaveProperty('datetime_end');
    expect(isRubitimeUpdateRecordPatchEmpty(out)).toBe(false);
  });
});
