import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireDoctorBookingEngineMock = vi.hoisted(() => vi.fn());
const staffRescheduleMock = vi.hoisted(() => vi.fn());
const getBookingByCanonicalAppointmentMock = vi.hoisted(() => vi.fn());
const principalState = vi.hoisted(() => ({ inside: false }));
const withDoctorWorkspacePrincipalMock = vi.hoisted(() =>
  vi.fn(
    async <T>(_workspace: { organizationId: string }, _source: string, fn: () => Promise<T>) => {
      principalState.inside = true;
      try {
        return await fn();
      } finally {
        principalState.inside = false;
      }
    },
  ),
);

vi.mock('../../../_requireDoctorBookingEngine', () => ({
  requireDoctorBookingEngine: requireDoctorBookingEngineMock,
}));

vi.mock('@/app-layer/booking/staffAppointmentLifecycleEffects', () => ({
  applyStaffRescheduleSideEffects: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/app-layer/principal/withOrganizationPrincipal', () => ({
  withDoctorWorkspacePrincipal: withDoctorWorkspacePrincipalMock,
}));

vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: () => ({
    bookingAppointmentLifecycle: { staffReschedule: staffRescheduleMock },
    appointmentProjection: null,
    appointmentMirrorSync: null,
    patientBooking: {
      getBookingByCanonicalAppointment: getBookingByCanonicalAppointmentMock,
    },
    payments: null,
    systemSettings: { getSetting: vi.fn().mockResolvedValue(null) },
  }),
}));

import { POST } from './route';

describe('POST manual-reschedule', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    principalState.inside = false;
  });

  it('returns ok when lifecycle accepts reschedule', async () => {
    getBookingByCanonicalAppointmentMock.mockResolvedValue(null);
    requireDoctorBookingEngineMock.mockResolvedValue({
      ok: true,
      ctx: {
        organizationId: 'org-1',
        session: { user: { userId: 'u1', role: 'doctor' } },
        service: {
          getAppointment: vi.fn().mockResolvedValue({
            id: 'appt-1',
            startAt: '2026-06-01T09:00:00.000Z',
            endAt: '2026-06-01T10:00:00.000Z',
            durationMinutes: 60,
            branchId: null,
            specialistId: null,
            serviceId: null,
          }),
        },
      },
    });
    staffRescheduleMock.mockImplementation(async () => {
      expect(principalState.inside).toBe(true);
      return {
        ok: true,
        appointment: { id: 'appt-1', platformUserId: 'u1' },
        reschedulePolicy: { notifyPatient: true, notifyStaff: true },
      };
    });

    const res = await POST(
      new Request('http://localhost/manual-reschedule', {
        method: 'POST',
        body: JSON.stringify({
          newStartAt: '2026-06-01T10:00:00.000Z',
          newEndAt: '2026-06-01T11:00:00.000Z',
          durationMinutes: 60,
        }),
        headers: { 'content-type': 'application/json' },
      }),
      { params: Promise.resolve({ id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' }) },
    );
    const json = (await res.json()) as { ok?: boolean };
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(staffRescheduleMock).toHaveBeenCalledWith(
      expect.objectContaining({ durationMinutes: 60 }),
    );
    expect(withDoctorWorkspacePrincipalMock).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'org-1' }),
      'doctor.booking-engine.appointments.manual-reschedule',
      expect.any(Function),
    );
  });

  it('reschedules a linked patient booking canonically', async () => {
    getBookingByCanonicalAppointmentMock.mockResolvedValue({});
    staffRescheduleMock.mockResolvedValue({
      ok: true,
      appointment: { id: 'appt-1', platformUserId: 'u1' },
      reschedulePolicy: { notifyPatient: true, notifyStaff: true },
    });
    requireDoctorBookingEngineMock.mockResolvedValue({
      ok: true,
      ctx: {
        organizationId: 'org-1',
        session: { user: { userId: 'u1', role: 'doctor' } },
        service: {
          getAppointment: vi.fn().mockResolvedValue({
            id: 'appt-1',
            startAt: '2026-06-01T09:00:00.000Z',
            endAt: '2026-06-01T10:00:00.000Z',
            durationMinutes: 60,
            branchId: null,
            specialistId: null,
            serviceId: null,
          }),
        },
      },
    });

    const res = await POST(
      new Request('http://localhost/manual-reschedule', {
        method: 'POST',
        body: JSON.stringify({
          newStartAt: '2026-06-01T10:00:00.000Z',
          newEndAt: '2026-06-01T11:00:00.000Z',
          durationMinutes: 60,
        }),
        headers: { 'content-type': 'application/json' },
      }),
      { params: Promise.resolve({ id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' }) },
    );
    const json = (await res.json()) as { ok?: boolean };
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(staffRescheduleMock).toHaveBeenCalled();
  });

  it('returns canonical slot_overlap', async () => {
    getBookingByCanonicalAppointmentMock.mockResolvedValue({});
    staffRescheduleMock.mockImplementation(async () => {
      expect(principalState.inside).toBe(true);
      throw new Error('slot_overlap');
    });
    requireDoctorBookingEngineMock.mockResolvedValue({
      ok: true,
      ctx: {
        organizationId: 'org-1',
        session: { user: { userId: 'u1', role: 'doctor' } },
        service: {
          getAppointment: vi.fn().mockResolvedValue({
            id: 'appt-1',
            startAt: '2026-06-01T09:00:00.000Z',
            endAt: '2026-06-01T10:00:00.000Z',
            durationMinutes: 60,
            branchId: null,
            specialistId: null,
            serviceId: null,
          }),
        },
      },
    });

    const res = await POST(
      new Request('http://localhost/manual-reschedule', {
        method: 'POST',
        body: JSON.stringify({
          newStartAt: '2026-06-01T10:00:00.000Z',
          newEndAt: '2026-06-01T11:00:00.000Z',
          durationMinutes: 60,
        }),
        headers: { 'content-type': 'application/json' },
      }),
      { params: Promise.resolve({ id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' }) },
    );
    const json = (await res.json()) as { ok?: boolean; error?: string };
    expect(res.status).toBe(409);
    expect(json.ok).toBe(false);
    expect(json.error).toBe('slot_overlap');
  });
});
