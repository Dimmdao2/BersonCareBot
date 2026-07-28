import { beforeEach, describe, expect, it, vi } from 'vitest';

const runWebappPgTextMock = vi.hoisted(() => vi.fn());

vi.mock('@/infra/db/runWebappSql', () => ({
  runWebappPgText: runWebappPgTextMock,
}));

import {
  filterCanonicalRowsNotPurged,
  loadPurgedCanonicalAppointmentIds,
  PURGED_CANONICAL_APPOINTMENT_NOT_EXISTS_SQL,
  PURGED_CANONICAL_BE_APPOINTMENTS_NOT_EXISTS_SQL,
} from './doctorAppointmentPurgeFilter';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const APPT_A = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const APPT_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

describe('doctorAppointmentPurgeFilter', () => {
  beforeEach(() => {
    runWebappPgTextMock.mockReset();
  });

  it('loadPurgedCanonicalAppointmentIds queries canonical deleted_at', async () => {
    runWebappPgTextMock.mockResolvedValue({ rows: [{ id: APPT_A }] });

    const purged = await loadPurgedCanonicalAppointmentIds(ORG_ID, [APPT_A, APPT_B]);

    expect(purged).toEqual(new Set([APPT_A]));
    const sql = String(runWebappPgTextMock.mock.calls[0]?.[0] ?? '');
    expect(sql).toContain('be_appointments');
    expect(sql).toContain('deleted_at IS NOT NULL');
    expect(sql).not.toContain('appointment_records');
  });

  it('filterCanonicalRowsNotPurged removes purged appointment ids', async () => {
    runWebappPgTextMock.mockResolvedValue({ rows: [{ id: APPT_A }] });

    const rows = [
      { id: APPT_A, status: 'cancelled_by_specialist' },
      { id: APPT_B, status: 'confirmed' },
    ];
    const visible = await filterCanonicalRowsNotPurged(ORG_ID, rows);

    expect(visible).toEqual([{ id: APPT_B, status: 'confirmed' }]);
  });

  it('filterCanonicalRowsNotPurged is no-op when nothing purged', async () => {
    runWebappPgTextMock.mockResolvedValue({ rows: [] });

    const rows = [{ id: APPT_A, status: 'cancelled_by_patient' }];
    const visible = await filterCanonicalRowsNotPurged(ORG_ID, rows);

    expect(visible).toEqual(rows);
  });

  it('PURGED_CANONICAL_APPOINTMENT_NOT_EXISTS_SQL references be_appointments alias a', () => {
    expect(PURGED_CANONICAL_APPOINTMENT_NOT_EXISTS_SQL).toBe('a.deleted_at IS NULL');
  });

  it('PURGED_CANONICAL_BE_APPOINTMENTS_NOT_EXISTS_SQL uses bare be_appointments table', () => {
    expect(PURGED_CANONICAL_BE_APPOINTMENTS_NOT_EXISTS_SQL).toBe(
      'be_appointments.deleted_at IS NULL',
    );
  });
});
