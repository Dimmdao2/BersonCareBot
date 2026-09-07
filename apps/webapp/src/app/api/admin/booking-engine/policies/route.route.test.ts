import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  buildAppDeps: vi.fn(),
  requireClinicManagementBookingEngine: vi.fn(),
  requireEntitlementForMutation: vi.fn(),
  withDoctorWorkspacePrincipal: vi.fn(),
  upsertBookingPolicy: vi.fn(),
  getBookingPolicy: vi.fn(),
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
    },
  });
  fakes.buildAppDeps.mockReturnValue({
    bookingPolicies: {
      upsertBookingPolicy: fakes.upsertBookingPolicy,
      getBookingPolicy: fakes.getBookingPolicy,
    },
  });
  fakes.withDoctorWorkspacePrincipal.mockImplementation(
    (_ctx: unknown, _source: string, callback: () => Promise<unknown>) => callback(),
  );
  fakes.upsertBookingPolicy.mockImplementation(async (input) => input);
  fakes.requireEntitlementForMutation.mockResolvedValue({ ok: true });
  fakes.getBookingPolicy.mockResolvedValue({ organizationId: ORGANIZATION_ID });
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
          sortOrder: 0,
        }),
      }),
    );

    expect(response.status).toBe(403);
    expect(fakes.requireEntitlementForMutation).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: ORGANIZATION_ID }),
      'booking',
    );
    expect(fakes.upsertBookingPolicy).not.toHaveBeenCalled();
  });

  it('returns the single organization policy', async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      policy: { organizationId: ORGANIZATION_ID },
    });
    expect(fakes.getBookingPolicy).toHaveBeenCalledWith(ORGANIZATION_ID);
  });

  it('creates the organization policy without requiring a pre-existing policy id', async () => {
    const response = await POST(
      new Request('http://localhost/api/admin/booking-engine/policies', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          cancellationAllowed: true,
          rescheduleAllowed: false,
          freeChangeHoursBefore: 72,
          lateChangeBehavior: 'manual_review',
          refundPrepaymentOnLate: 'manual',
          chargePackageSessionOnLate: false,
          requiresStaffConfirmation: false,
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(fakes.upsertBookingPolicy).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORGANIZATION_ID,
        cancellationAllowed: true,
        rescheduleAllowed: false,
        freeChangeHoursBefore: 72,
      }),
    );
  });

});
