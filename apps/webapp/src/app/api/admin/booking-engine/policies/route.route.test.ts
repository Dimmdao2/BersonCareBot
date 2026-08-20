import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  buildAppDeps: vi.fn(),
  requireClinicManagementBookingEngine: vi.fn(),
  requireEntitlementForMutation: vi.fn(),
  withDoctorWorkspacePrincipal: vi.fn(),
  upsertCancellationPolicy: vi.fn(),
  upsertReschedulePolicy: vi.fn(),
  listCancellationPolicies: vi.fn(),
  listReschedulePolicies: vi.fn(),
  getService: vi.fn(),
}));

vi.mock('@/app-layer/di/buildAppDeps', () => ({ buildAppDeps: fakes.buildAppDeps }));
vi.mock('@/app-layer/guards/requireEntitlement', () => ({
  requireEntitlementForMutation: fakes.requireEntitlementForMutation,
}));
vi.mock('../_requireClinicManagementBookingEngine', () => ({
  requireClinicManagementBookingEngine: fakes.requireClinicManagementBookingEngine,
}));
vi.mock('@/app-layer/principal/withOrganizationPrincipal', () => ({
  withDoctorWorkspacePrincipal: fakes.withDoctorWorkspacePrincipal,
}));

import { GET, POST } from './route';

const ORGANIZATION_ID = '00000000-0000-4000-8000-000000001140';

beforeEach(() => {
  vi.clearAllMocks();
  fakes.requireClinicManagementBookingEngine.mockResolvedValue({
    ok: true,
    ctx: {
      organizationId: ORGANIZATION_ID,
      service: { catalog: {}, services: { getService: fakes.getService } },
    },
  });
  fakes.buildAppDeps.mockReturnValue({
    bookingPolicies: {
      upsertCancellationPolicy: fakes.upsertCancellationPolicy,
      upsertReschedulePolicy: fakes.upsertReschedulePolicy,
      listCancellationPolicies: fakes.listCancellationPolicies,
      listReschedulePolicies: fakes.listReschedulePolicies,
    },
  });
  fakes.withDoctorWorkspacePrincipal.mockImplementation(
    (_ctx: unknown, _source: string, callback: () => Promise<unknown>) => callback(),
  );
  fakes.upsertCancellationPolicy.mockResolvedValue({ id: 'policy-1' });
  fakes.requireEntitlementForMutation.mockResolvedValue({ ok: true });
  fakes.listCancellationPolicies.mockResolvedValue([]);
  fakes.listReschedulePolicies.mockResolvedValue([]);
});

describe('admin booking-engine policies POST — booking entitlement gate', () => {
  it('returns 403 without calling the write service when booking mutation is denied', async () => {
    const denied = new Response(JSON.stringify({ ok: false }), { status: 403 });
    fakes.requireEntitlementForMutation.mockResolvedValue({ ok: false, response: denied });

    const response = await POST(
      new Request('http://localhost/api/admin/booking-engine/policies', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          kind: 'cancellation',
          scopeLevel: 'organization',
          title: 'Отмена',
          isActive: true,
          freeCancelHoursBefore: 24,
          cancellationAllowed: true,
          lateCancellationBehavior: 'penalty',
          refundPrepaymentOnLate: 'none',
          chargePackageSessionOnLate: false,
          requiresStaffConfirmation: false,
          notifyPatient: true,
          notifyStaff: true,
          sortOrder: 0,
        }),
      }),
    );

    expect(response.status).toBe(403);
    expect(fakes.requireEntitlementForMutation).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: ORGANIZATION_ID }),
      'booking',
    );
    expect(fakes.upsertCancellationPolicy).not.toHaveBeenCalled();
  });

  it('returns an honest empty organization state for the UI to seed', async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      cancellationPolicies: [],
      reschedulePolicies: [],
    });
    expect(fakes.listCancellationPolicies).toHaveBeenCalledWith(ORGANIZATION_ID);
    expect(fakes.listReschedulePolicies).toHaveBeenCalledWith(ORGANIZATION_ID);
  });

  it('creates the organization policy without requiring a pre-existing policy id', async () => {
    const response = await POST(
      new Request('http://localhost/api/admin/booking-engine/policies', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          kind: 'cancellation',
          scopeLevel: 'organization',
          scopeEntityId: null,
          title: 'Правила отмены клиники',
          isActive: true,
          freeCancelHoursBefore: 72,
          cancellationAllowed: true,
          lateCancellationBehavior: 'manual_review',
          refundPrepaymentOnLate: 'manual',
          chargePackageSessionOnLate: false,
          requiresStaffConfirmation: false,
          notifyPatient: true,
          notifyStaff: true,
          sortOrder: 0,
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(fakes.upsertCancellationPolicy).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORGANIZATION_ID,
        scopeLevel: 'organization',
        scopeEntityId: ORGANIZATION_ID,
      }),
    );
  });

  it('refuses a service from another organization before the write port', async () => {
    fakes.getService.mockResolvedValue({
      id: '22222222-2222-4222-8222-222222222222',
      organizationId: '33333333-3333-4333-8333-333333333333',
    });

    const response = await POST(
      new Request('http://localhost/api/admin/booking-engine/policies', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          kind: 'reschedule',
          scopeLevel: 'service',
          scopeEntityId: '22222222-2222-4222-8222-222222222222',
          title: 'Перенос',
          isActive: true,
          selfRescheduleHoursBefore: 48,
          maxSelfReschedules: 1,
          allowDifferentBranch: false,
          allowDifferentCity: false,
          allowDifferentSpecialist: false,
          allowDifferentService: false,
          limitExceededBehavior: 'manual_request',
          requiresStaffConfirmation: false,
          notifyPatient: true,
          notifyStaff: true,
          sortOrder: 0,
        }),
      }),
    );

    expect(response.status).toBe(404);
    expect(fakes.upsertReschedulePolicy).not.toHaveBeenCalled();
  });
});
