import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireAdminBookingEngineMock = vi.hoisted(() => vi.fn());
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
const createAppointmentMock = vi.hoisted(() => vi.fn());
const transitionAppointmentStatusMock = vi.hoisted(() => vi.fn());
const deleteAppointmentHardMock = vi.hoisted(() => vi.fn());
const emitBookingEventMock = vi.hoisted(() => vi.fn());
const resolveLegacyBranchServiceIdMock = vi.hoisted(() => vi.fn());
const assertSlotAvailableMock = vi.hoisted(() => vi.fn());
const listSpecialistsMock = vi.hoisted(() => vi.fn());

vi.mock('../../_requireAdminBookingEngine', () => ({
  requireAdminBookingEngine: requireAdminBookingEngineMock,
}));

vi.mock('@/app-layer/principal/withOrganizationPrincipal', () => ({
  withDoctorWorkspacePrincipal: withDoctorWorkspacePrincipalMock,
}));

vi.mock('@/modules/integrator/bookingM2mApi', () => ({
  createBookingSyncPort: () => ({
    emitBookingEvent: emitBookingEventMock,
  }),
}));

vi.mock('@/app-layer/booking/emitPackageCalendarSync', () => ({
  emitPackageLinkedCalendarSync: vi.fn().mockResolvedValue('skipped'),
}));

vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: () => ({
    bookingScheduling: {
      assertSlotAvailable: assertSlotAvailableMock,
      resolveLegacyBranchServiceId: resolveLegacyBranchServiceIdMock,
    },
    bookingEngine: {
      catalog: { listSpecialists: listSpecialistsMock },
    },
    memberships: null,
    patientBooking: null,
  }),
}));

import { POST } from './route';

describe('POST admin manual appointment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    principalState.inside = false;
  });

  it('creates the canonical appointment', async () => {
    requireAdminBookingEngineMock.mockResolvedValue({
      ok: true,
      ctx: {
        organizationId: 'org-1',
        session: { user: { userId: 'a1', role: 'admin' } },
        service: {
          createAppointment: createAppointmentMock,
          transitionAppointmentStatus: transitionAppointmentStatusMock,
          deleteAppointmentHard: deleteAppointmentHardMock,
        },
      },
    });
    createAppointmentMock.mockResolvedValue({
      id: 'appt-1',
      startAt: '2026-06-01T10:00:00.000Z',
      endAt: '2026-06-01T11:00:00.000Z',
      platformUserId: null,
      phoneNormalized: null,
      attributionJson: {},
      organizationId: 'org-1',
      status: 'confirmed',
      source: 'admin_manual',
    });
    assertSlotAvailableMock.mockResolvedValue(undefined);
    emitBookingEventMock.mockResolvedValue(undefined);

    const res = await POST(
      new Request('http://localhost/manual', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          organizationId: '44444444-4444-4444-8444-444444444444',
          branchId: '11111111-1111-4111-8111-111111111111',
          serviceId: '22222222-2222-4222-8222-222222222222',
          specialistId: '33333333-3333-4333-8333-333333333333',
          startAt: '2026-06-01T10:00:00.000Z',
          endAt: '2026-06-01T11:00:00.000Z',
          durationMinutes: 60,
        }),
      }),
    );

    expect(res.status).toBe(200);
    expect(resolveLegacyBranchServiceIdMock).not.toHaveBeenCalled();
    expect(deleteAppointmentHardMock).not.toHaveBeenCalled();
    expect(transitionAppointmentStatusMock).not.toHaveBeenCalled();
    expect(emitBookingEventMock).toHaveBeenCalled();
  });

  it('F2: rejects in-person create with no resolvable specialist (not inserted)', async () => {
    requireAdminBookingEngineMock.mockResolvedValue({
      ok: true,
      ctx: {
        organizationId: 'org-1',
        session: { user: { userId: 'a1', role: 'admin' } },
        service: {
          createAppointment: createAppointmentMock,
          transitionAppointmentStatus: transitionAppointmentStatusMock,
          deleteAppointmentHard: deleteAppointmentHardMock,
        },
      },
    });
    listSpecialistsMock.mockResolvedValue([]);

    const res = await POST(
      new Request('http://localhost/manual', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          branchId: '11111111-1111-4111-8111-111111111111',
          serviceId: '22222222-2222-4222-8222-222222222222',
          // no specialistId, none resolvable from catalog
          startAt: '2026-06-01T10:00:00.000Z',
          endAt: '2026-06-01T11:00:00.000Z',
          durationMinutes: 60,
        }),
      }),
    );
    const json = (await res.json()) as { ok?: boolean; error?: string };
    expect(res.status).toBe(400);
    expect(json.ok).toBe(false);
    expect(json.error).toBe('specialist_required');
    expect(createAppointmentMock).not.toHaveBeenCalled();
    expect(assertSlotAvailableMock).not.toHaveBeenCalled();
    expect(withDoctorWorkspacePrincipalMock).not.toHaveBeenCalled();
  });

  it('F2: in-person create with a resolvable specialist succeeds (uses default specialist)', async () => {
    requireAdminBookingEngineMock.mockResolvedValue({
      ok: true,
      ctx: {
        organizationId: 'org-1',
        session: { user: { userId: 'a1', role: 'admin' } },
        service: {
          createAppointment: createAppointmentMock,
          transitionAppointmentStatus: transitionAppointmentStatusMock,
          deleteAppointmentHard: deleteAppointmentHardMock,
          getAppointment: vi.fn(),
        },
      },
    });
    const bodyOrgId = '44444444-4444-4444-8444-444444444444';
    listSpecialistsMock.mockResolvedValue([
      { id: '33333333-3333-4333-8333-333333333333', isActive: true },
    ]);
    createAppointmentMock.mockImplementation(async () => {
      expect(principalState.inside).toBe(true);
      return {
        id: 'appt-1',
        startAt: '2026-06-01T10:00:00.000Z',
        endAt: '2026-06-01T11:00:00.000Z',
        platformUserId: null,
        phoneNormalized: null,
        attributionJson: {},
        organizationId: bodyOrgId,
        status: 'confirmed',
        source: 'admin_manual',
        specialistId: '33333333-3333-4333-8333-333333333333',
      };
    });
    assertSlotAvailableMock.mockImplementation(async () => {
      expect(principalState.inside).toBe(false);
    });
    resolveLegacyBranchServiceIdMock.mockResolvedValue('branch-service-id');
    const res = await POST(
      new Request('http://localhost/manual', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          organizationId: bodyOrgId,
          branchId: '11111111-1111-4111-8111-111111111111',
          serviceId: '22222222-2222-4222-8222-222222222222',
          // no explicit specialistId → resolved from catalog default
          startAt: '2026-06-01T10:00:00.000Z',
          endAt: '2026-06-01T11:00:00.000Z',
          durationMinutes: 60,
        }),
      }),
    );
    const json = (await res.json()) as { ok?: boolean };
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(assertSlotAvailableMock).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: bodyOrgId,
        specialistId: '33333333-3333-4333-8333-333333333333',
      }),
    );
    expect(createAppointmentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: bodyOrgId,
        specialistId: '33333333-3333-4333-8333-333333333333',
      }),
    );
    expect(withDoctorWorkspacePrincipalMock).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: bodyOrgId }),
      'admin.booking-engine.appointments.manual-create',
      expect.any(Function),
    );
    expect(principalState.inside).toBe(false);
  });
});
