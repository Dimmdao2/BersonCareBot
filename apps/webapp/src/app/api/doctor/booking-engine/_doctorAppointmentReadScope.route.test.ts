import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DoctorBookingEngineContext } from './_requireDoctorBookingEngine';

const mocks = vi.hoisted(() => ({
  buildAppDeps: vi.fn(),
  getAppointment: vi.fn(),
  listAppointmentComments: vi.fn(),
  listCancellations: vi.fn(),
  listReschedules: vi.fn(),
  loadPaymentSummary: vi.fn(),
  requireDoctorBookingEngine: vi.fn(),
}));

vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: mocks.buildAppDeps,
}));
vi.mock('@/app-layer/booking/staffAppointmentPaymentSummary', () => ({
  loadStaffAppointmentPaymentSummary: mocks.loadPaymentSummary,
}));
vi.mock('@/app-layer/guards/doctorWorkspacePrincipal', () => ({
  withDoctorWorkspacePrincipal: vi.fn(),
}));
vi.mock('@/app-layer/guards/requireRole', () => ({
  requireDoctorWorkspaceApiContext: vi.fn(),
}));
vi.mock('@/app/api/doctor/booking-engine/_requireDoctorBookingEngine', () => ({
  requireDoctorBookingEngine: mocks.requireDoctorBookingEngine,
}));

import { GET as getComments } from './appointments/[id]/comments/route';
import { GET as getLifecycle } from './appointments/[id]/lifecycle/route';
import { GET as getPayment } from './appointments/[id]/payment/route';

const APPOINTMENT_ID = '30000000-0000-4000-8000-000000000001';
const ORGANIZATION_ID = '20000000-0000-4000-8000-000000000001';
const OWN_ID = '10000000-0000-4000-8000-000000000001';
const OTHER_ID = '10000000-0000-4000-8000-000000000002';

function doctorContext(): DoctorBookingEngineContext {
  return {
    session: { user: { userId: 'doctor-user' } } as DoctorBookingEngineContext['session'],
    service: {
      getAppointment: mocks.getAppointment,
    } as unknown as DoctorBookingEngineContext['service'],
    organizationId: ORGANIZATION_ID,
    membershipId: 'membership-1',
    membershipRole: 'doctor',
    specialistId: OWN_ID,
    canManageOrganization: false,
    canManageAllSpecialists: false,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireDoctorBookingEngine.mockResolvedValue({ ok: true, ctx: doctorContext() });
  mocks.getAppointment.mockResolvedValue({
    id: APPOINTMENT_ID,
    organizationId: ORGANIZATION_ID,
    specialistId: OTHER_ID,
  });
  mocks.buildAppDeps.mockReturnValue({
    bookingAppointmentLifecycle: {
      listReschedules: mocks.listReschedules,
      listCancellations: mocks.listCancellations,
    },
    clientHistory: {
      listAppointmentComments: mocks.listAppointmentComments,
    },
    payments: {},
  });
});

describe('doctor appointment direct read scope', () => {
  it('returns neutral not-found before lifecycle, comments, or payment data for another specialist', async () => {
    const context = { params: Promise.resolve({ id: APPOINTMENT_ID }) };
    const request = new Request(
      `https://app.example.test/api/doctor/booking-engine/appointments/${APPOINTMENT_ID}`,
    );

    const responses = await Promise.all([
      getLifecycle(request, context),
      getComments(request, context),
      getPayment(request, context),
    ]);

    for (const response of responses) {
      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toEqual({ ok: false, error: 'not_found' });
    }
    expect(mocks.listReschedules).not.toHaveBeenCalled();
    expect(mocks.listCancellations).not.toHaveBeenCalled();
    expect(mocks.listAppointmentComments).not.toHaveBeenCalled();
    expect(mocks.loadPaymentSummary).not.toHaveBeenCalled();
  });
});
