import { describe, expect, it, vi } from 'vitest';
const listActivePackagesForBookingMock = vi.hoisted(() => vi.fn());
const listPatientPackagesForUserMock = vi.hoisted(() => vi.fn());
const listCatalogPackagesForPatientMock = vi.hoisted(() => vi.fn());
const getPatientPackageDetailMock = vi.hoisted(() => vi.fn());
const resolveCatalogPackageOrganizationIdMock = vi.hoisted(() => vi.fn());
const resolvePatientPackageOrganizationIdMock = vi.hoisted(() => vi.fn());
const resolveActiveOrganizationForPatientMock = vi.hoisted(() => vi.fn());
const requirePatientApiBusinessAccessMock = vi.hoisted(() => vi.fn());
const resolveCanonicalInPersonContextMock = vi.hoisted(() => vi.fn());
const ORG_ID = '11111111-1111-4111-8111-111111111111';

vi.mock('@/app-layer/guards/requireRole', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/app-layer/guards/requireRole')>();
  return {
    ...actual,
    requirePatientApiBusinessAccess: requirePatientApiBusinessAccessMock,
  };
});

vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: () => ({
    memberships: {
      listActivePackagesForBooking: listActivePackagesForBookingMock,
      listPatientPackagesForUser: listPatientPackagesForUserMock,
      listCatalogPackagesForPatient: listCatalogPackagesForPatientMock,
      getPatientPackageDetail: getPatientPackageDetailMock,
      resolveCatalogPackageOrganizationId: resolveCatalogPackageOrganizationIdMock,
      resolvePatientPackageOrganizationId: resolvePatientPackageOrganizationIdMock,
    },
    patientOrganization: {
      resolveActiveOrganizationForPatient: resolveActiveOrganizationForPatientMock,
    },
    bookingEngine: {
      organization: { getDefaultOrganizationId: async () => ORG_ID },
      catalog: {
        getBranch: async () => ({ organizationId: ORG_ID }),
        listSpecialists: async () => [{ id: 'sp-1', isActive: true }],
      },
      services: { getService: async () => ({ organizationId: ORG_ID }) },
    },
    bookingScheduling: {
      resolveCanonicalInPersonContext: resolveCanonicalInPersonContextMock,
    },
  }),
}));

import { GET as getAvailable } from './memberships/available/route';
import { GET as getMemberships } from './memberships/route';
import { GET as getCatalog } from './memberships/catalog/route';
import { GET as getDetail } from './memberships/[id]/route';

requirePatientApiBusinessAccessMock.mockResolvedValue({
  ok: true,
  session: { user: { userId: 'u1', role: 'client' as const } },
});
resolveActiveOrganizationForPatientMock.mockResolvedValue({ ok: true, organizationId: ORG_ID });
resolveCatalogPackageOrganizationIdMock.mockResolvedValue(ORG_ID);
resolvePatientPackageOrganizationIdMock.mockResolvedValue(ORG_ID);

describe('booking membership routes', () => {
  it('GET available resolves branchId+serviceId', async () => {
    resolveCanonicalInPersonContextMock.mockResolvedValue({
      organizationId: ORG_ID,
      branchId: '550e8400-e29b-41d4-a716-446655440001',
      serviceId: 'svc-1',
    });
    listActivePackagesForBookingMock.mockResolvedValue([{ id: 'pp-1' }]);
    const res = await getAvailable(
      new Request(
        'http://localhost/api/booking/memberships/available?branchId=550e8400-e29b-41d4-a716-446655440001&serviceId=svc-1',
      ),
    );
    expect(res.status).toBe(200);
    expect(listActivePackagesForBookingMock).toHaveBeenCalledWith('u1', ORG_ID, 'svc-1');
  });

  it('GET available returns 404 for unmapped canonical pair', async () => {
    resolveCanonicalInPersonContextMock.mockResolvedValue(null);
    const res = await getAvailable(
      new Request(
        'http://localhost/api/booking/memberships/available?branchId=550e8400-e29b-41d4-a716-446655440001&serviceId=550e8400-e29b-41d4-a716-446655440002',
      ),
    );
    expect(res.status).toBe(404);
  });

  it('GET memberships lists patient packages', async () => {
    listPatientPackagesForUserMock.mockResolvedValue([]);
    const res = await getMemberships();
    expect(res.status).toBe(200);
  });

  it('GET catalog returns products', async () => {
    listCatalogPackagesForPatientMock.mockResolvedValue([]);
    const res = await getCatalog();
    expect(res.status).toBe(200);
  });

  it('GET detail returns 404 for foreign package', async () => {
    getPatientPackageDetailMock.mockResolvedValue({
      package: { platformUserId: 'other' },
      usages: [],
      history: [],
    });
    const res = await getDetail(new Request('http://x'), {
      params: Promise.resolve({ id: 'pp-1' }),
    });
    expect(res.status).toBe(404);
  });
});
