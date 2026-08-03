import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  buildAppDeps: vi.fn(),
  requireDoctorBookingEngine: vi.fn(),
  withDoctorWorkspacePrincipal: vi.fn(),
}));

vi.mock('@/app-layer/di/buildAppDeps', () => ({ buildAppDeps: fakes.buildAppDeps }));
vi.mock('../_requireDoctorBookingEngine', () => ({
  requireDoctorBookingEngine: fakes.requireDoctorBookingEngine,
}));
vi.mock('@/app-layer/principal/withOrganizationPrincipal', () => ({
  withDoctorWorkspacePrincipal: fakes.withDoctorWorkspacePrincipal,
}));

import { POST } from './route';

const organizationId = '11111111-1111-4111-8111-111111111111';
const platformUserId = '0194c2c5-1d75-7a42-8b64-a9b49aa52ba3';
const serviceId = '33333333-3333-4333-8333-333333333333';
const catalogPackageId = '44444444-4444-4444-8444-444444444444';

function manualPackageRequest() {
  return new Request('http://test/api/doctor/booking-engine/patient-packages', {
    method: 'POST',
    body: JSON.stringify({
      kind: 'manual',
      platformUserId,
      priceMinor: 1000,
      items: [{ serviceId, quantity: 1 }],
    }),
  });
}

describe('POST /api/doctor/booking-engine/patient-packages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakes.withDoctorWorkspacePrincipal.mockImplementation(
      async (_ctx: unknown, _source: string, callback: () => Promise<unknown>) => callback(),
    );
    fakes.requireDoctorBookingEngine.mockResolvedValue({
      ok: true,
      ctx: { organizationId, session: { user: { userId: 'doctor-user' } } },
    });
  });

  it.each([
    ['disabled', 'entitlement_required'],
    ['read_only', 'commercial_read_only'],
  ] as const)('refuses a direct clinic sale when subscriptions are %s', async (state, error) => {
    const createManualPatientPackage = vi.fn();
    fakes.buildAppDeps.mockReturnValue({
      orgEntitlements: { resolveMechanicAccess: async () => ({ state, warning: null }) },
      memberships: { createManualPatientPackage },
    });

    const response = await POST(manualPackageRequest());

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error,
      mechanic: 'subscriptions',
    });
    expect(createManualPatientPackage).not.toHaveBeenCalled();
  });

  it('keeps direct clinic sales available with full subscriptions access', async () => {
    const createManualPatientPackage = vi.fn().mockResolvedValue({ id: 'package-1' });
    fakes.buildAppDeps.mockReturnValue({
      orgEntitlements: {
        resolveMechanicAccess: async () => ({ state: 'full_access', warning: null }),
      },
      memberships: { createManualPatientPackage },
    });

    const response = await POST(manualPackageRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, package: { id: 'package-1' } });
  });

  it.each([
    ['disabled', 'entitlement_required'],
    ['read_only', 'commercial_read_only'],
  ] as const)(
    'does not send a manual paid package online when payments are %s',
    async (state, error) => {
      const createManualPatientPackage = vi.fn();
      fakes.buildAppDeps.mockReturnValue({
        orgEntitlements: {
          resolveMechanicAccess: async (_organizationId: string, mechanic: string) => ({
            state: mechanic === 'payments' ? state : 'full_access',
            warning: null,
          }),
        },
        memberships: { createManualPatientPackage },
      });

      const response = await POST(manualPackageRequest());

      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toMatchObject({
        ok: false,
        error,
        mechanic: 'payments',
      });
      expect(createManualPatientPackage).not.toHaveBeenCalled();
    },
  );

  it('keeps an offline manual sale available when payments are disabled', async () => {
    const createManualPatientPackage = vi.fn().mockResolvedValue({ id: 'offline-package' });
    fakes.buildAppDeps.mockReturnValue({
      orgEntitlements: {
        resolveMechanicAccess: async (_organizationId: string, mechanic: string) => ({
          state: mechanic === 'payments' ? 'disabled' : 'full_access',
          warning: null,
        }),
      },
      memberships: { createManualPatientPackage },
    });

    const response = await POST(
      new Request('http://test/api/doctor/booking-engine/patient-packages', {
        method: 'POST',
        body: JSON.stringify({
          kind: 'manual',
          platformUserId,
          priceMinor: 1000,
          items: [{ serviceId, quantity: 1 }],
          sendForPayment: false,
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(createManualPatientPackage).toHaveBeenCalledOnce();
  });

  it('does not offer a paid catalog package online when payments are disabled', async () => {
    const offerCatalogPackageToPatient = vi.fn();
    fakes.buildAppDeps.mockReturnValue({
      orgEntitlements: {
        resolveMechanicAccess: async (_organizationId: string, mechanic: string) => ({
          state: mechanic === 'payments' ? 'disabled' : 'full_access',
          warning: null,
        }),
      },
      memberships: {
        getCatalogPackage: vi.fn().mockResolvedValue({ id: catalogPackageId, priceMinor: 2500 }),
        offerCatalogPackageToPatient,
      },
    });

    const response = await POST(
      new Request('http://test/api/doctor/booking-engine/patient-packages', {
        method: 'POST',
        body: JSON.stringify({
          kind: 'catalog',
          platformUserId,
          subscriptionPackageId: catalogPackageId,
        }),
      }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: 'entitlement_required',
      mechanic: 'payments',
    });
    expect(offerCatalogPackageToPatient).not.toHaveBeenCalled();
  });

  it('keeps a free catalog package available when payments are disabled', async () => {
    const offerCatalogPackageToPatient = vi.fn().mockResolvedValue({ id: 'free-package' });
    fakes.buildAppDeps.mockReturnValue({
      orgEntitlements: {
        resolveMechanicAccess: async (_organizationId: string, mechanic: string) => ({
          state: mechanic === 'payments' ? 'disabled' : 'full_access',
          warning: null,
        }),
      },
      memberships: {
        getCatalogPackage: vi.fn().mockResolvedValue({ id: catalogPackageId, priceMinor: 0 }),
        offerCatalogPackageToPatient,
      },
    });

    const response = await POST(
      new Request('http://test/api/doctor/booking-engine/patient-packages', {
        method: 'POST',
        body: JSON.stringify({
          kind: 'catalog',
          platformUserId,
          subscriptionPackageId: catalogPackageId,
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(offerCatalogPackageToPatient).toHaveBeenCalledOnce();
  });

  it('keeps a staff-recorded catalog sale available when payments are disabled', async () => {
    const offerCatalogPackageToPatient = vi.fn().mockResolvedValue({ id: 'staff-package' });
    fakes.buildAppDeps.mockReturnValue({
      orgEntitlements: {
        resolveMechanicAccess: async (_organizationId: string, mechanic: string) => ({
          state: mechanic === 'payments' ? 'disabled' : 'full_access',
          warning: null,
        }),
      },
      memberships: {
        getCatalogPackage: vi.fn().mockResolvedValue({ id: catalogPackageId, priceMinor: 2500 }),
        offerCatalogPackageToPatient,
      },
    });

    const response = await POST(
      new Request('http://test/api/doctor/booking-engine/patient-packages', {
        method: 'POST',
        body: JSON.stringify({
          kind: 'catalog',
          platformUserId,
          subscriptionPackageId: catalogPackageId,
          soldAt: '2026-08-03T00:00:00.000Z',
          paidAmountMinor: 2500,
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(offerCatalogPackageToPatient).toHaveBeenCalledOnce();
  });
});
