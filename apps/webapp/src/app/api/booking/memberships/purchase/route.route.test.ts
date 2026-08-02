import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  buildAppDeps: vi.fn(),
  requirePatientApiBusinessAccess: vi.fn(),
  withExplicitOrganizationPrincipal: vi.fn(),
}));

vi.mock('@/app-layer/di/buildAppDeps', () => ({ buildAppDeps: fakes.buildAppDeps }));
vi.mock('@/app-layer/guards/requireRole', () => ({
  requirePatientApiBusinessAccess: fakes.requirePatientApiBusinessAccess,
}));
vi.mock('@/app-layer/principal/withOrganizationPrincipal', () => ({
  withExplicitOrganizationPrincipal: fakes.withExplicitOrganizationPrincipal,
}));

import { POST } from './route';

const organizationId = '11111111-1111-4111-8111-111111111111';
const patientUserId = '22222222-2222-4222-822222222222';
const catalogPackageId = '33333333-3333-4333-8333-333333333333';

describe('POST /api/booking/memberships/purchase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakes.requirePatientApiBusinessAccess.mockResolvedValue({
      ok: true,
      session: { user: { userId: patientUserId } },
    });
  });

  it.each([
    ['disabled', 'entitlement_required'],
    ['read_only', 'commercial_read_only'],
  ] as const)('refuses a direct patient purchase when subscriptions are %s', async (state, error) => {
    const purchaseCatalogPackageForPatient = vi.fn();
    fakes.buildAppDeps.mockReturnValue({
      orgEntitlements: { resolveMechanicAccess: async () => ({ state, warning: null }) },
      memberships: {
        resolveCatalogPackageOrganizationId: vi.fn().mockResolvedValue(organizationId),
        purchaseCatalogPackageForPatient,
      },
    });

    const response = await POST(
      new Request('http://test/api/booking/memberships/purchase', {
        method: 'POST',
        body: JSON.stringify({ subscriptionPackageId: catalogPackageId }),
      }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error,
      mechanic: 'subscriptions',
    });
    expect(purchaseCatalogPackageForPatient).not.toHaveBeenCalled();
  });

  it('keeps the patient purchase flow available with full subscriptions access', async () => {
    const purchaseCatalogPackageForPatient = vi.fn().mockResolvedValue({ id: 'package-1' });
    fakes.withExplicitOrganizationPrincipal.mockImplementation(
      async (_context: unknown, callback: () => Promise<unknown>) => callback(),
    );
    fakes.buildAppDeps.mockReturnValue({
      orgEntitlements: { resolveMechanicAccess: async () => ({ state: 'full_access', warning: null }) },
      memberships: {
        resolveCatalogPackageOrganizationId: vi.fn().mockResolvedValue(organizationId),
        purchaseCatalogPackageForPatient,
      },
    });

    const response = await POST(
      new Request('http://test/api/booking/memberships/purchase', {
        method: 'POST',
        body: JSON.stringify({ subscriptionPackageId: catalogPackageId }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, package: { id: 'package-1' } });
    expect(purchaseCatalogPackageForPatient).toHaveBeenCalledWith({
      organizationId,
      platformUserId: patientUserId,
      subscriptionPackageId: catalogPackageId,
    });
  });
});
