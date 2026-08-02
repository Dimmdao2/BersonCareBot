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

  it('refuses a patient purchase in read-only access before creating a package', async () => {
    const purchaseCatalogPackageForPatient = vi.fn();
    fakes.buildAppDeps.mockReturnValue({
      orgEntitlements: { resolveMechanicAccess: async () => ({ state: 'read_only', warning: null }) },
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
      error: 'commercial_read_only',
      mechanic: 'subscriptions',
    });
    expect(purchaseCatalogPackageForPatient).not.toHaveBeenCalled();
  });
});
