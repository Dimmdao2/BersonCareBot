import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  buildAppDeps: vi.fn(),
  requireClinicManagementBookingEngine: vi.fn(),
  requireEntitlementForMutation: vi.fn(),
  withDoctorWorkspacePrincipal: vi.fn(),
  upsertCancellationPolicy: vi.fn(),
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

import { POST } from './route';

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
    bookingPolicies: { upsertCancellationPolicy: fakes.upsertCancellationPolicy },
  });
  fakes.withDoctorWorkspacePrincipal.mockImplementation(
    (_ctx: unknown, _source: string, callback: () => Promise<unknown>) => callback(),
  );
  fakes.upsertCancellationPolicy.mockResolvedValue({ id: 'policy-1' });
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
});
