import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  buildAppDeps: vi.fn(),
  requireClinicManagementBookingEngine: vi.fn(),
  getMechanicMutationAvailability: vi.fn(),
  getMechanicSurfaceVisibility: vi.fn(),
  requireEntitlementForMutation: vi.fn(),
  withDoctorWorkspacePrincipal: vi.fn(),
  getService: vi.fn(),
  listPrepaymentPolicies: vi.fn(),
  getPrepaymentAvailability: vi.fn(),
  upsertPrepaymentPolicy: vi.fn(),
}));

vi.mock('@/app-layer/di/buildAppDeps', () => ({ buildAppDeps: fakes.buildAppDeps }));
vi.mock('@/app-layer/guards/requireEntitlement', () => ({
  getMechanicMutationAvailability: fakes.getMechanicMutationAvailability,
  getMechanicSurfaceVisibility: fakes.getMechanicSurfaceVisibility,
  requireEntitlementForMutation: fakes.requireEntitlementForMutation,
}));
vi.mock('../_requireClinicManagementBookingEngine', () => ({
  requireClinicManagementBookingEngine: fakes.requireClinicManagementBookingEngine,
}));
vi.mock('@/app-layer/principal/withOrganizationPrincipal', () => ({
  withDoctorWorkspacePrincipal: fakes.withDoctorWorkspacePrincipal,
}));

import { GET, PUT } from './route';

const ORGANIZATION_ID = '00000000-0000-4000-8000-000000001130';
const SERVICE_ID = '00000000-0000-4000-8000-000000001131';

function policyRequest(mode: 'disabled' | 'fixed_minor' = 'fixed_minor'): Request {
  return new Request('http://localhost/api/admin/booking-engine/prepayment-policies', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      scope: 'service',
      serviceId: SERVICE_ID,
      mode,
      amountMinor: mode === 'fixed_minor' ? 1_000 : null,
    }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  fakes.requireClinicManagementBookingEngine.mockResolvedValue({
    ok: true,
    ctx: {
      organizationId: ORGANIZATION_ID,
      service: { services: { getService: fakes.getService } },
    },
  });
  fakes.buildAppDeps.mockReturnValue({
    payments: {
      listPrepaymentPolicies: fakes.listPrepaymentPolicies,
      getPrepaymentAvailability: fakes.getPrepaymentAvailability,
      upsertPrepaymentPolicy: fakes.upsertPrepaymentPolicy,
    },
  });
  fakes.getMechanicMutationAvailability.mockResolvedValue({ available: true });
  fakes.getMechanicSurfaceVisibility.mockResolvedValue({ directUrl: true });
  fakes.requireEntitlementForMutation.mockResolvedValue({ ok: true });
  fakes.withDoctorWorkspacePrincipal.mockImplementation(
    (_ctx: unknown, _source: string, callback: () => Promise<unknown>) => callback(),
  );
  fakes.getService.mockResolvedValue({ id: SERVICE_ID, organizationId: ORGANIZATION_ID });
  fakes.listPrepaymentPolicies.mockResolvedValue([]);
  fakes.getPrepaymentAvailability.mockResolvedValue({ available: true });
  fakes.upsertPrepaymentPolicy.mockResolvedValue({ id: 'policy-1', mode: 'disabled' });
});

describe('B1.3 prepayment policy API', () => {
  it('returns stored policies with the tariff refusal needed to disable the editor', async () => {
    fakes.listPrepaymentPolicies.mockResolvedValue([{ id: 'policy-1', mode: 'fixed_minor' }]);
    fakes.getMechanicMutationAvailability.mockResolvedValue({
      available: false,
      reason: 'entitlement_required',
    });

    const response = await GET();

    expect(await response.json()).toEqual({
      ok: true,
      policies: [{ id: 'policy-1', mode: 'fixed_minor' }],
      availability: { available: false, reason: 'entitlement_required' },
      visible: true,
    });
    expect(fakes.getPrepaymentAvailability).not.toHaveBeenCalled();
  });

  it('does not persist a non-disabled policy when the tariff denies mutation access', async () => {
    const denied = Response.json(
      { ok: false, error: 'entitlement_required', mechanic: 'booking_prepayment' },
      { status: 403 },
    );
    fakes.requireEntitlementForMutation.mockResolvedValue({ ok: false, response: denied });

    const response = await PUT(policyRequest());

    expect(response).toBe(denied);
    expect(fakes.upsertPrepaymentPolicy).not.toHaveBeenCalled();
  });

  it('hides policies when the mechanic is off without reading stored payment data', async () => {
    fakes.getMechanicSurfaceVisibility.mockResolvedValue({ directUrl: false });

    const response = await GET();

    expect(await response.json()).toEqual({
      ok: true,
      policies: [],
      availability: { available: false, reason: 'entitlement_required' },
      visible: false,
    });
    expect(fakes.listPrepaymentPolicies).not.toHaveBeenCalled();
  });

  it('does not persist a non-disabled policy when no configured provider can create an intent', async () => {
    fakes.getPrepaymentAvailability.mockResolvedValue({
      available: false,
      reason: 'payment_provider_unavailable',
    });

    const response = await PUT(policyRequest());

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      ok: false,
      error: 'payment_provider_unavailable',
      availability: { available: false, reason: 'payment_provider_unavailable' },
    });
    expect(fakes.upsertPrepaymentPolicy).not.toHaveBeenCalled();
  });

  it('persists an active policy only for a service owned by the clinic', async () => {
    const response = await PUT(policyRequest());

    expect(response.status).toBe(200);
    expect(fakes.upsertPrepaymentPolicy).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORGANIZATION_ID,
        serviceId: SERVICE_ID,
        mode: 'fixed_minor',
      }),
    );
  });

  it('does not persist an active policy for a service owned by another clinic', async () => {
    fakes.getService.mockResolvedValue({
      id: SERVICE_ID,
      organizationId: '00000000-0000-4000-8000-000000001132',
    });

    const response = await PUT(policyRequest());

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ ok: false, error: 'service_not_found' });
    expect(fakes.upsertPrepaymentPolicy).not.toHaveBeenCalled();
  });

  it('refuses even a disabled policy change when the tariff denies mutation access', async () => {
    fakes.requireEntitlementForMutation.mockResolvedValue({
      ok: false,
      response: Response.json({ ok: false, error: 'entitlement_required' }, { status: 403 }),
    });

    const response = await PUT(policyRequest('disabled'));

    expect(response.status).toBe(403);
    expect(fakes.requireEntitlementForMutation).toHaveBeenCalledWith(
      { organizationId: ORGANIZATION_ID },
      'booking_prepayment',
    );
    expect(fakes.getPrepaymentAvailability).not.toHaveBeenCalled();
    expect(fakes.upsertPrepaymentPolicy).not.toHaveBeenCalled();
  });
});
