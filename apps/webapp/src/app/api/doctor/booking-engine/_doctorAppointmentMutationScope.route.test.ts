import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BeAppointment } from '@/modules/booking-engine/types';
import type { DoctorBookingEngineContext } from './_requireDoctorBookingEngine';

const mocks = vi.hoisted(() => ({
  applyStaffRescheduleSideEffects: vi.fn(),
  buildAppDeps: vi.fn(),
  createAppointment: vi.fn(),
  emitBookingEvent: vi.fn(),
  getAppointment: vi.fn(),
  loadLifecycleSettings: vi.fn(),
  requireDoctorBookingEngine: vi.fn(),
  runPackageDetach: vi.fn(),
  runStaffManualCancelAfterCanonical: vi.fn(),
  runStaffManualNoShowAfterCanonical: vi.fn(),
  staffCancel: vi.fn(),
  staffMarkNoShow: vi.fn(),
  staffPurgeCancelledAppointment: vi.fn(),
  staffReschedule: vi.fn(),
}));

vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: mocks.buildAppDeps,
}));
vi.mock('@/app-layer/booking/staffAppointmentLifecycleEffects', () => ({
  applyStaffRescheduleSideEffects: mocks.applyStaffRescheduleSideEffects,
}));
vi.mock('@/app-layer/booking/staffManualCancelAfterCanonical', () => ({
  runStaffManualCancelAfterCanonical: mocks.runStaffManualCancelAfterCanonical,
}));
vi.mock('@/app-layer/booking/staffManualNoShow', () => ({
  runStaffManualNoShowAfterCanonical: mocks.runStaffManualNoShowAfterCanonical,
}));
vi.mock('@/app-layer/booking/staffPurgeCancelledAppointment', () => ({
  staffPurgeCancelledAppointment: mocks.staffPurgeCancelledAppointment,
}));
vi.mock('@/app/api/booking-engine/packageDetachShared', () => ({
  runPackageDetach: mocks.runPackageDetach,
}));
vi.mock('@/app-layer/principal/withOrganizationPrincipal', () => ({
  withDoctorWorkspacePrincipal: vi.fn(
    async (_ctx: unknown, _operation: string, run: () => unknown) => run(),
  ),
}));
vi.mock('@/app-layer/guards/doctorWorkspacePrincipal', () => ({
  withDoctorWorkspacePrincipal: vi.fn(async (_ctx: unknown, run: () => unknown) => run()),
}));
vi.mock('@/modules/integrator/bookingM2mApi', () => ({
  createBookingSyncPort: vi.fn(() => ({ emitBookingEvent: mocks.emitBookingEvent })),
}));
vi.mock('@/modules/booking-notifications/settings', () => ({
  loadBookingLifecycleNotificationsFromSystemSettings: mocks.loadLifecycleSettings,
}));
vi.mock('@/app/api/doctor/booking-engine/_requireDoctorBookingEngine', () => ({
  requireDoctorBookingEngine: mocks.requireDoctorBookingEngine,
}));

import { POST as addComment } from './appointments/[id]/comments/route';
import { POST as deleteAppointment } from './appointments/[id]/delete/route';
import { POST as cancelAppointment } from './appointments/[id]/manual-cancel/route';
import { POST as markNoShow } from './appointments/[id]/manual-no-show/route';
import { POST as rescheduleAppointment } from './appointments/[id]/manual-reschedule/route';
import { POST as detachPackage } from './appointments/[id]/package/detach/route';
import { POST as refundPackage } from './appointments/[id]/package/refund/route';
import { POST as unlinkPackage } from './appointments/[id]/package/unlink/route';
import { POST as createAppointment } from './appointments/manual/route';

const APPOINTMENT_ID = '30000000-0000-4000-8000-000000000001';
const ORGANIZATION_ID = '20000000-0000-4000-8000-000000000001';
const OWN_ID = '10000000-0000-4000-8000-000000000001';
const OTHER_ID = '10000000-0000-4000-8000-000000000002';

function appointment(specialistId: string): BeAppointment {
  return {
    id: APPOINTMENT_ID,
    organizationId: ORGANIZATION_ID,
    branchId: null,
    roomId: null,
    specialistId,
    serviceId: null,
    platformUserId: '40000000-0000-4000-8000-000000000001',
    startAt: '2026-07-30T10:00:00.000Z',
    endAt: '2026-07-30T10:30:00.000Z',
    durationMinutes: 30,
    source: 'admin_manual',
    status: 'confirmed',
    originalStartAt: null,
    rescheduleCount: 0,
    paymentRef: null,
    packageUsageRef: null,
    phoneNormalized: null,
    attributionJson: {},
  };
}

function context(canManageAllSpecialists: boolean): DoctorBookingEngineContext {
  return {
    session: {
      user: { userId: 'doctor-user', role: canManageAllSpecialists ? 'admin' : 'doctor' },
    } as DoctorBookingEngineContext['session'],
    service: {
      getAppointment: mocks.getAppointment,
      createAppointment: mocks.createAppointment,
      catalog: {
        listSpecialists: vi.fn().mockResolvedValue([
          { id: OWN_ID, fullName: 'Свой специалист', isActive: true },
          { id: OTHER_ID, fullName: 'Другой специалист', isActive: true },
        ]),
      },
    } as unknown as DoctorBookingEngineContext['service'],
    organizationId: ORGANIZATION_ID,
    membershipId: 'membership-1',
    membershipRole: canManageAllSpecialists ? 'admin' : 'doctor',
    specialistId: OWN_ID,
    canManageOrganization: canManageAllSpecialists,
    canManageAllSpecialists,
  };
}

function request(path: string, body: unknown): Request {
  return new Request(`https://app.example.test${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireDoctorBookingEngine.mockResolvedValue({ ok: true, ctx: context(false) });
  mocks.buildAppDeps.mockReturnValue({
    bookingAppointmentLifecycle: {
      staffCancel: mocks.staffCancel,
      staffMarkNoShow: mocks.staffMarkNoShow,
      staffReschedule: mocks.staffReschedule,
    },
    systemSettings: { getSetting: vi.fn() },
  });
  mocks.loadLifecycleSettings.mockResolvedValue({});
  mocks.runStaffManualCancelAfterCanonical.mockResolvedValue({});
});

describe('doctor appointment mutation scope', () => {
  it('returns neutral not-found before any own-only mutation side effect for another specialist', async () => {
    mocks.getAppointment.mockResolvedValue(appointment(OTHER_ID));
    const routeContext = { params: Promise.resolve({ id: APPOINTMENT_ID }) };
    const base = `/api/doctor/booking-engine/appointments/${APPOINTMENT_ID}`;

    const responses = await Promise.all([
      deleteAppointment(request(`${base}/delete`, {}), routeContext),
      markNoShow(request(`${base}/manual-no-show`, {}), routeContext),
      addComment(request(`${base}/comments`, { body: 'Комментарий' }), routeContext),
      detachPackage(request(`${base}/package/detach`, {}), routeContext),
      refundPackage(request(`${base}/package/refund`, {}), routeContext),
      unlinkPackage(request(`${base}/package/unlink`, {}), routeContext),
    ]);

    for (const response of responses) {
      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toEqual({ ok: false, error: 'not_found' });
    }
    expect(mocks.buildAppDeps).not.toHaveBeenCalled();
    expect(mocks.staffPurgeCancelledAppointment).not.toHaveBeenCalled();
    expect(mocks.runPackageDetach).not.toHaveBeenCalled();
  });

  it('lets a clinic manager reschedule and cancel another current-clinic appointment', async () => {
    const other = appointment(OTHER_ID);
    mocks.requireDoctorBookingEngine.mockResolvedValue({ ok: true, ctx: context(true) });
    mocks.getAppointment.mockResolvedValue(other);
    mocks.staffReschedule.mockResolvedValue({
      ok: true,
      appointment: other,
      reschedulePolicy: {},
    });
    mocks.staffCancel.mockResolvedValue({
      ok: true,
      appointment: other,
      cancelPolicy: {},
    });
    const routeContext = { params: Promise.resolve({ id: APPOINTMENT_ID }) };
    const base = `/api/doctor/booking-engine/appointments/${APPOINTMENT_ID}`;

    const rescheduleResponse = await rescheduleAppointment(
      request(`${base}/manual-reschedule`, {
        newStartAt: '2026-07-30T11:00:00.000Z',
        newEndAt: '2026-07-30T11:30:00.000Z',
        durationMinutes: 30,
        specialistId: OTHER_ID,
      }),
      routeContext,
    );
    const cancelResponse = await cancelAppointment(
      request(`${base}/manual-cancel`, { decisionType: 'free' }),
      routeContext,
    );

    expect(rescheduleResponse.status).toBe(200);
    expect(cancelResponse.status).toBe(200);
    expect(mocks.staffReschedule).toHaveBeenCalledWith(
      expect.objectContaining({ appointmentId: APPOINTMENT_ID, specialistId: OTHER_ID }),
    );
    expect(mocks.staffCancel).toHaveBeenCalledWith(
      expect.objectContaining({ appointmentId: APPOINTMENT_ID }),
    );
  });

  it('rejects specialist reassignment during reschedule before the lifecycle mutation', async () => {
    mocks.requireDoctorBookingEngine.mockResolvedValue({ ok: true, ctx: context(true) });
    mocks.getAppointment.mockResolvedValue(appointment(OTHER_ID));

    const response = await rescheduleAppointment(
      request(`/api/doctor/booking-engine/appointments/${APPOINTMENT_ID}/manual-reschedule`, {
        newStartAt: '2026-07-30T11:00:00.000Z',
        newEndAt: '2026-07-30T11:30:00.000Z',
        durationMinutes: 30,
        specialistId: OWN_ID,
      }),
      { params: Promise.resolve({ id: APPOINTMENT_ID }) },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'invalid_specialist',
    });
    expect(mocks.staffReschedule).not.toHaveBeenCalled();
  });

  it('ignores a hostile create specialist ID for a normal doctor', async () => {
    const created = appointment(OWN_ID);
    mocks.createAppointment.mockResolvedValue(created);
    mocks.buildAppDeps.mockReturnValue({});

    const response = await createAppointment(
      request('/api/doctor/booking-engine/appointments/manual', {
        specialistId: OTHER_ID,
        startAt: '2026-07-30T10:00:00.000Z',
        endAt: '2026-07-30T10:30:00.000Z',
        durationMinutes: 30,
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.createAppointment).toHaveBeenCalledWith(
      expect.objectContaining({ specialistId: OWN_ID }),
    );
  });
});
