import { beforeEach, describe, expect, it, vi } from 'vitest';

const runWebappPgTextMock = vi.hoisted(() => vi.fn());
const clientQueryMock = vi.hoisted(() => vi.fn());
const connectMock = vi.hoisted(() =>
  vi.fn(async () => ({
    query: clientQueryMock,
    release: vi.fn(),
  })),
);
const getPoolMock = vi.hoisted(() => vi.fn(() => ({ connect: connectMock })));

vi.mock('@/infra/db/runWebappSql', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/infra/db/runWebappSql')>();
  return {
    ...actual,
    runWebappPgText: runWebappPgTextMock,
  };
});

vi.mock('@/infra/db/client', () => ({
  getPool: getPoolMock,
}));

import { createPgAppointmentProjectionPort } from './pgAppointmentProjection';

describe('pgAppointmentProjection softDeleteByIntegratorId', () => {
  beforeEach(() => {
    runWebappPgTextMock.mockReset();
    clientQueryMock.mockReset();
    connectMock.mockClear();
    clientQueryMock.mockImplementation(async (sql: string) => {
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
        return { rows: [] };
      }
      return { rows: [], rowCount: 0 };
    });
  });

  it('runs domain SQL via runWebappPgText on tx client and commits when updated', async () => {
    runWebappPgTextMock
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ deleted_at: null }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] });

    const port = createPgAppointmentProjectionPort();
    const ok = await port.softDeleteByIntegratorId('rt-record-1');

    expect(ok).toBe(true);
    expect(clientQueryMock).toHaveBeenCalledWith('BEGIN');
    expect(clientQueryMock).toHaveBeenCalledWith('COMMIT');
    // 3 -> 2: Rubitime retirement removed the legacy patient_bookings.rubitime_id update;
    // without a canonical appointment id, only the projection read + soft-delete remain.
    expect(runWebappPgTextMock).toHaveBeenCalledTimes(2);
    const appointmentUpdateSql = String(runWebappPgTextMock.mock.calls[1]?.[0] ?? '');
    expect(appointmentUpdateSql).toContain('appointment_records');
    expect(runWebappPgTextMock.mock.calls[1]?.[1]).toEqual(['rt-record-1']);
    expect(runWebappPgTextMock.mock.calls.map((call) => String(call[0])).join('\n')).not.toContain(
      'patient_bookings',
    );
  });

  it('returns false without patient_bookings update when appointment row missing', async () => {
    runWebappPgTextMock.mockResolvedValueOnce({ rowCount: 0, rows: [] });

    const port = createPgAppointmentProjectionPort();
    const ok = await port.softDeleteByIntegratorId('missing');

    expect(ok).toBe(false);
    expect(runWebappPgTextMock).toHaveBeenCalledTimes(1);
    expect(clientQueryMock).toHaveBeenCalledWith('ROLLBACK');
  });

  it('staff purge deletes patient_bookings when purgePatientBookings is set', async () => {
    runWebappPgTextMock
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ deleted_at: null }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] });

    const port = createPgAppointmentProjectionPort();
    const ok = await port.softDeleteByIntegratorId('rt-purge', {
      purgePatientBookings: true,
      canonicalAppointmentId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      cancelReason: 'staff_delete',
    });

    expect(ok).toBe(true);
    const canonicalDeleteSql = String(runWebappPgTextMock.mock.calls[2]?.[0] ?? '');
    expect(canonicalDeleteSql).toContain('UPDATE be_appointments');
    expect(canonicalDeleteSql).toContain('deleted_at = now()');
    const deleteSql = String(runWebappPgTextMock.mock.calls[3]?.[0] ?? '');
    expect(deleteSql).toContain('DELETE FROM patient_bookings');
  });

  it('is idempotent when appointment_records already soft-deleted', async () => {
    runWebappPgTextMock
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ deleted_at: new Date('2026-01-01') }] })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] });

    const port = createPgAppointmentProjectionPort();
    const ok = await port.softDeleteByIntegratorId('rt-purged', {
      purgePatientBookings: true,
      canonicalAppointmentId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      cancelReason: 'staff_delete',
    });

    expect(ok).toBe(true);
    const updateSql = String(runWebappPgTextMock.mock.calls[1]?.[0] ?? '');
    expect(updateSql).not.toContain('UPDATE appointment_records');
    expect(updateSql).toContain('UPDATE be_appointments');
    expect(String(runWebappPgTextMock.mock.calls[2]?.[0] ?? '')).toContain(
      'DELETE FROM patient_bookings',
    );
  });

  describe('organizationId guard (SAAS Hole#3)', () => {
    it('refuses the delete when the record resolves to a different canonical organization', async () => {
      runWebappPgTextMock
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ deleted_at: null }] })
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ organization_id: 'org-other' }] });

      const port = createPgAppointmentProjectionPort();
      const ok = await port.softDeleteByIntegratorId('be:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', {
        organizationId: 'org-mine',
      });

      expect(ok).toBe(false);
      expect(clientQueryMock).toHaveBeenCalledWith('ROLLBACK');
      expect(clientQueryMock).not.toHaveBeenCalledWith('COMMIT');
      // Only the existence check + org resolution ran — no mutation was issued.
      expect(runWebappPgTextMock).toHaveBeenCalledTimes(2);
      const orgResolveSql = String(runWebappPgTextMock.mock.calls[1]?.[0] ?? '');
      expect(orgResolveSql).toContain('be_appointments');
      // Rubitime retirement removed the external mapping branch; the destructive guard now
      // accepts only the exact native `be:<uuid>` canonical id shape.
      expect(orgResolveSql).not.toContain('be_external_entity_mappings');
      expect(orgResolveSql).toContain('SUBSTRING($1 FROM 4)');
    });

    it('proceeds when the resolved canonical organization matches the caller', async () => {
      runWebappPgTextMock
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ deleted_at: null }] })
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [{ id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', organization_id: 'org-mine' }],
        })
        .mockResolvedValueOnce({ rowCount: 1, rows: [] })
        .mockResolvedValueOnce({ rowCount: 1, rows: [] })
        .mockResolvedValueOnce({ rowCount: 0, rows: [] });

      const port = createPgAppointmentProjectionPort();
      const ok = await port.softDeleteByIntegratorId('be:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', {
        organizationId: 'org-mine',
      });

      expect(ok).toBe(true);
      expect(clientQueryMock).toHaveBeenCalledWith('COMMIT');
      expect(runWebappPgTextMock).toHaveBeenCalledTimes(5);
      expect(String(runWebappPgTextMock.mock.calls[3]?.[0] ?? '')).toContain(
        'UPDATE be_appointments',
      );
    });

    it('proceeds (dormant/unscoped-legacy compatible) when the record has no canonical org mapping', async () => {
      runWebappPgTextMock
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ deleted_at: null }] })
        .mockResolvedValueOnce({ rowCount: 0, rows: [] })
        .mockResolvedValueOnce({ rowCount: 1, rows: [] })
        .mockResolvedValueOnce({ rowCount: 0, rows: [] });

      const port = createPgAppointmentProjectionPort();
      const ok = await port.softDeleteByIntegratorId('rt-legacy-only', {
        organizationId: 'org-mine',
      });

      expect(ok).toBe(true);
      expect(clientQueryMock).toHaveBeenCalledWith('COMMIT');
      // 4 -> 3: no Rubitime mapping means there is no canonical id and therefore no legacy
      // patient_bookings.rubitime_id mutation after the projection soft-delete.
      expect(runWebappPgTextMock).toHaveBeenCalledTimes(3);
    });

    it('skips the organization resolution query entirely when no organizationId is supplied (unchanged legacy callers)', async () => {
      runWebappPgTextMock
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ deleted_at: null }] })
        .mockResolvedValueOnce({ rowCount: 1, rows: [] })
        .mockResolvedValueOnce({ rowCount: 0, rows: [] });

      const port = createPgAppointmentProjectionPort();
      const ok = await port.softDeleteByIntegratorId('rt-record-legacy-caller');

      expect(ok).toBe(true);
      // 3 -> 2: Rubitime retirement removed the legacy patient_bookings.rubitime_id update;
      // this caller now performs only the projection read + soft-delete.
      expect(runWebappPgTextMock).toHaveBeenCalledTimes(2);
    });
  });
});
