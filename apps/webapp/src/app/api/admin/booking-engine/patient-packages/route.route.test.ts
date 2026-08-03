import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  buildAppDeps: vi.fn(),
  requireAdminBookingEngine: vi.fn(),
  withDoctorWorkspacePrincipal: vi.fn(),
}));

vi.mock('@/app-layer/di/buildAppDeps', () => ({ buildAppDeps: fakes.buildAppDeps }));
vi.mock('../_requireAdminBookingEngine', () => ({
  requireAdminBookingEngine: fakes.requireAdminBookingEngine,
}));
vi.mock('@/app-layer/principal/withOrganizationPrincipal', () => ({
  withDoctorWorkspacePrincipal: fakes.withDoctorWorkspacePrincipal,
}));

import { POST } from './route';

const organizationId = '11111111-1111-4111-8111-111111111111';
const platformUserId = '22222222-2222-4222-8222-222222222222';
const serviceId = '33333333-3333-4333-8333-333333333333';
const catalogPackageId = '44444444-4444-4444-8444-444444444444';

function request(body: Record<string, unknown>) {
  return new Request('http://test/api/admin/booking-engine/patient-packages', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

function paymentAccess(state: 'full_access' | 'disabled' | 'read_only') {
  return {
    resolveMechanicAccess: async (_organizationId: string, mechanic: string) => ({
      state: mechanic === 'payments' ? state : 'full_access',
      warning: null,
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  fakes.requireAdminBookingEngine.mockResolvedValue({
    ok: true,
    ctx: { organizationId, session: { user: { userId: 'admin-user' } } },
  });
  fakes.withDoctorWorkspacePrincipal.mockImplementation(
    async (_ctx: unknown, _source: string, callback: () => Promise<unknown>) => callback(),
  );
});

describe('POST /api/admin/booking-engine/patient-packages', () => {
  it.each([
    ['disabled', 'entitlement_required'],
    ['read_only', 'commercial_read_only'],
  ] as const)(
    'does not send a manual paid package online when payments are %s',
    async (state, error) => {
      const createManualPatientPackage = vi.fn();
      fakes.buildAppDeps.mockReturnValue({
        orgEntitlements: paymentAccess(state),
        memberships: { createManualPatientPackage },
      });

      const response = await POST(
        request({
          kind: 'manual',
          platformUserId,
          priceMinor: 1000,
          items: [{ serviceId, quantity: 1 }],
        }),
      );

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
      orgEntitlements: paymentAccess('disabled'),
      memberships: { createManualPatientPackage },
    });

    const response = await POST(
      request({
        kind: 'manual',
        platformUserId,
        priceMinor: 1000,
        items: [{ serviceId, quantity: 1 }],
        sendForPayment: false,
      }),
    );

    expect(response.status).toBe(200);
    expect(createManualPatientPackage).toHaveBeenCalledOnce();
  });

  it('does not offer a paid catalog package online when payments are disabled', async () => {
    const offerCatalogPackageToPatient = vi.fn();
    fakes.buildAppDeps.mockReturnValue({
      orgEntitlements: paymentAccess('disabled'),
      memberships: {
        getCatalogPackage: vi.fn().mockResolvedValue({ id: catalogPackageId, priceMinor: 2500 }),
        offerCatalogPackageToPatient,
      },
    });

    const response = await POST(
      request({ kind: 'catalog', platformUserId, subscriptionPackageId: catalogPackageId }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: 'entitlement_required',
      mechanic: 'payments',
    });
    expect(offerCatalogPackageToPatient).not.toHaveBeenCalled();
  });

  it.each([
    ['free', { priceMinor: 0 }],
    [
      'staff-recorded',
      { priceMinor: 2500, soldAt: '2026-08-03T00:00:00.000Z', paidAmountMinor: 2500 },
    ],
  ] as const)(
    'keeps a %s catalog sale available when payments are disabled',
    async (_case, sale) => {
      const offerCatalogPackageToPatient = vi.fn().mockResolvedValue({ id: `${_case}-package` });
      fakes.buildAppDeps.mockReturnValue({
        orgEntitlements: paymentAccess('disabled'),
        memberships: {
          getCatalogPackage: vi.fn().mockResolvedValue({
            id: catalogPackageId,
            priceMinor: sale.priceMinor,
          }),
          offerCatalogPackageToPatient,
        },
      });

      const response = await POST(
        request({
          kind: 'catalog',
          platformUserId,
          subscriptionPackageId: catalogPackageId,
          ...('soldAt' in sale
            ? { soldAt: sale.soldAt, paidAmountMinor: sale.paidAmountMinor }
            : {}),
        }),
      );

      expect(response.status).toBe(200);
      expect(offerCatalogPackageToPatient).toHaveBeenCalledOnce();
    },
  );
});
