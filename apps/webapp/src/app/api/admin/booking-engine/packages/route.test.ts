import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireAdminBookingEngineMock = vi.hoisted(() => vi.fn());
const listCatalogPackagesMock = vi.hoisted(() => vi.fn());
const upsertCatalogPackageMock = vi.hoisted(() => vi.fn());
const principalState = vi.hoisted(() => ({ inside: false }));
const withDoctorWorkspacePrincipalMock = vi.hoisted(() =>
  vi.fn(
    async <T>(_workspace: { organizationId: string }, _source: string, fn: () => Promise<T>) => {
      principalState.inside = true;
      try {
        return await fn();
      } finally {
        principalState.inside = false;
      }
    },
  ),
);

vi.mock('../_requireAdminBookingEngine', () => ({
  requireAdminBookingEngine: requireAdminBookingEngineMock,
}));

vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: () => ({
    memberships: {
      listCatalogPackages: listCatalogPackagesMock,
      upsertCatalogPackage: upsertCatalogPackageMock,
    },
  }),
}));

vi.mock('@/app-layer/principal/withOrganizationPrincipal', () => ({
  withDoctorWorkspacePrincipal: withDoctorWorkspacePrincipalMock,
}));

import { GET, POST } from './route';

const ORG = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SERVICE_ID = '550e8400-e29b-41d4-a716-446655440001';

const createdPkg = {
  id: '550e8400-e29b-41d4-a716-446655440030',
  organizationId: ORG,
  title: 'New package',
  description: null,
  priceMinor: 15000,
  currency: 'RUB',
  validityDays: 60,
  deductionMode: 'auto_on_visit_confirmed',
  isActive: true,
  items: [{ id: 'i-1', serviceId: SERVICE_ID, quantity: 10, sortOrder: 0 }],
};

describe('/api/admin/booking-engine/packages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    principalState.inside = false;
    requireAdminBookingEngineMock.mockResolvedValue({
      ok: true,
      ctx: { organizationId: ORG, session: { user: { userId: 'u1' } } },
    });
    listCatalogPackagesMock.mockResolvedValue([createdPkg]);
    upsertCatalogPackageMock.mockImplementation(async () => {
      expect(principalState.inside).toBe(true);
      return createdPkg;
    });
  });

  it('GET lists packages without principal wrapper', async () => {
    const res = await GET();
    const json = (await res.json()) as { ok?: boolean; packages?: (typeof createdPkg)[] };

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.packages).toHaveLength(1);
    expect(listCatalogPackagesMock).toHaveBeenCalledWith(ORG, false);
    expect(withDoctorWorkspacePrincipalMock).not.toHaveBeenCalled();
  });

  it('POST creates a catalog package inside admin workspace principal', async () => {
    const res = await POST(
      new Request('http://localhost/api/admin/booking-engine/packages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'New package',
          priceMinor: 15000,
          validityDays: 60,
          deductionMode: 'auto_on_visit_confirmed',
          isActive: true,
          items: [{ serviceId: SERVICE_ID, quantity: 10 }],
        }),
      }),
    );
    const json = (await res.json()) as { ok?: boolean; package?: typeof createdPkg };

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.package?.title).toBe('New package');
    expect(upsertCatalogPackageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORG,
        title: 'New package',
        priceMinor: 15000,
        items: [{ serviceId: SERVICE_ID, quantity: 10 }],
      }),
    );
    expect(withDoctorWorkspacePrincipalMock).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: ORG }),
      'admin.booking-engine.packages.upsert',
      expect.any(Function),
    );
  });
});
