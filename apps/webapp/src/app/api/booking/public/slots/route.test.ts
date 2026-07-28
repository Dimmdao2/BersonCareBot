import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getCurrentDbPrincipalOrganizationId } from '@bersoncare/db-principal';

const resolvePublicBookingOrganizationMock = vi.hoisted(() => vi.fn());
const resolveCanonicalInPersonContextMock = vi.hoisted(() => vi.fn());
const getBranchMock = vi.hoisted(() => vi.fn());
const getServiceMock = vi.hoisted(() => vi.fn());
const getSlotsMock = vi.hoisted(() => vi.fn());
const resolveOrganizationIdBySlugMock = vi.hoisted(() => vi.fn());
const warnMock = vi.hoisted(() => vi.fn());

vi.mock('@/app-layer/logging/logger', () => ({
  logger: { warn: warnMock, error: vi.fn() },
}));

vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: () => ({
    patientBooking: { getSlots: getSlotsMock },
    clinicDirectory: { resolveOrganizationIdBySlug: resolveOrganizationIdBySlugMock },
    bookingEngine: {
      catalog: { getBranch: getBranchMock },
      services: { getService: getServiceMock },
    },
    bookingScheduling: {
      resolvePublicBookingOrganization: resolvePublicBookingOrganizationMock,
      resolveCanonicalInPersonContext: resolveCanonicalInPersonContextMock,
    },
  }),
}));

import { GET } from './route';

const ORG_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_ORG_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab';
const BRANCH_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const SERVICE_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
let organizationSeenByTenantRead: string | undefined;

describe('GET /api/booking/public/slots', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    organizationSeenByTenantRead = undefined;
    resolvePublicBookingOrganizationMock.mockResolvedValue(ORG_ID);
    resolveOrganizationIdBySlugMock.mockResolvedValue(ORG_ID);
    getBranchMock.mockImplementation(async () => {
      organizationSeenByTenantRead = getCurrentDbPrincipalOrganizationId();
      return { id: BRANCH_ID, organizationId: ORG_ID };
    });
    getServiceMock.mockResolvedValue({ id: SERVICE_ID, organizationId: ORG_ID });
    resolveCanonicalInPersonContextMock.mockResolvedValue({
      organizationId: ORG_ID,
      branchId: BRANCH_ID,
      serviceId: SERVICE_ID,
    });
    getSlotsMock.mockResolvedValue([{ date: '2026-07-17', slots: [] }]);
  });

  it('derives the tenant and passes only canonical keys', async () => {
    const response = await GET(
      new Request(
        `http://localhost/api/booking/public/slots?type=in_person&branchId=${BRANCH_ID}&serviceId=${SERVICE_ID}&orgSlug=clinic-a`,
      ),
    );
    expect(response.status).toBe(200);
    expect(resolvePublicBookingOrganizationMock).toHaveBeenCalledWith({
      branchId: BRANCH_ID,
      serviceId: SERVICE_ID,
    });
    expect(getSlotsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORG_ID,
        branchId: BRANCH_ID,
        serviceId: SERVICE_ID,
      }),
    );
  });

  it('rejects a legacy-id-only request before booking reads', async () => {
    const response = await GET(
      new Request(
        'http://localhost/api/booking/public/slots?type=in_person&branchServiceId=dddddddd-dddd-4ddd-8ddd-dddddddddddd&orgSlug=clinic-a',
      ),
    );
    expect(response.status).toBe(400);
    expect(getSlotsMock).not.toHaveBeenCalled();
  });

  it('derives org first, then performs tenant reads under that explicit org', async () => {
    const response = await GET(
      new Request(
        `http://localhost/api/booking/public/slots?type=in_person&branchId=${BRANCH_ID}&serviceId=${SERVICE_ID}&orgSlug=clinic-a`,
      ),
    );

    expect(response.status).toBe(200);
    expect(resolvePublicBookingOrganizationMock.mock.invocationCallOrder[0]).toBeLessThan(
      getBranchMock.mock.invocationCallOrder[0]!,
    );
    expect(organizationSeenByTenantRead).toBe(ORG_ID);
  });

  it('keeps distinct private tenant-resolution failures wire-identical and logs their reasons', async () => {
    resolvePublicBookingOrganizationMock.mockResolvedValue(null);
    const emptyResolverResponse = await GET(
      new Request(
        `http://localhost/api/booking/public/slots?type=in_person&branchId=${BRANCH_ID}&serviceId=${SERVICE_ID}&orgSlug=clinic-a`,
      ),
    );
    resolveOrganizationIdBySlugMock.mockResolvedValue(null);
    const unknownSlugResponse = await GET(
      new Request(
        `http://localhost/api/booking/public/slots?type=in_person&branchId=${BRANCH_ID}&serviceId=${SERVICE_ID}&orgSlug=clinic-a`,
      ),
    );

    expect(emptyResolverResponse.status).toBe(400);
    await expect(emptyResolverResponse.json()).resolves.toEqual({
      ok: false,
      error: 'ambiguous_booking_tenant',
    });
    expect(unknownSlugResponse.status).toBe(400);
    await expect(unknownSlugResponse.json()).resolves.toEqual({
      ok: false,
      error: 'ambiguous_booking_tenant',
    });
    expect(warnMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        reason: 'public_resolver_empty',
        branchId: BRANCH_ID,
        serviceId: SERVICE_ID,
        orgSlug: 'clinic-a',
      }),
      expect.stringContaining('in-person booking resolution refused'),
    );
    expect(warnMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        reason: 'slug_unknown',
        branchId: BRANCH_ID,
        serviceId: SERVICE_ID,
        orgSlug: 'clinic-a',
      }),
      expect.stringContaining('in-person booking resolution refused'),
    );
    expect(getBranchMock).not.toHaveBeenCalled();
    expect(getSlotsMock).not.toHaveBeenCalled();
  });

  it('denies clinic-A URLs carrying valid clinic-B booking ids before tenant reads', async () => {
    resolveOrganizationIdBySlugMock.mockResolvedValue(ORG_ID);
    resolvePublicBookingOrganizationMock.mockResolvedValue(OTHER_ORG_ID);

    const response = await GET(
      new Request(
        `http://localhost/api/booking/public/slots?type=in_person&branchId=${BRANCH_ID}&serviceId=${SERVICE_ID}&orgSlug=clinic-a`,
      ),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ ok: false, error: 'ambiguous_booking_tenant' });
    expect(getBranchMock).not.toHaveBeenCalled();
    expect(getSlotsMock).not.toHaveBeenCalled();
  });

  it('keeps generic /book requests without an organization slug fail-closed', async () => {
    const response = await GET(
      new Request(
        `http://localhost/api/booking/public/slots?type=in_person&branchId=${BRANCH_ID}&serviceId=${SERVICE_ID}`,
      ),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ ok: false, error: 'ambiguous_booking_tenant' });
    expect(resolvePublicBookingOrganizationMock).not.toHaveBeenCalled();
    expect(getSlotsMock).not.toHaveBeenCalled();
  });
});
