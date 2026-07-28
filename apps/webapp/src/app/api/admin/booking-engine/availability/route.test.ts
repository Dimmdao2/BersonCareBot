import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireClinicManagementBookingEngineMock = vi.hoisted(() => vi.fn());
const withDoctorWorkspacePrincipalMock = vi.hoisted(() =>
  vi.fn(async (_ctx: unknown, _source: string, callback: () => Promise<unknown>) => callback()),
);
const getServiceMock = vi.hoisted(() => vi.fn());
const getBranchMock = vi.hoisted(() => vi.fn());
const getSpecialistMock = vi.hoisted(() => vi.fn());
const setSoloServiceLocationAvailabilityMock = vi.hoisted(() => vi.fn());

vi.mock('../_requireAdminBookingEngine', () => ({
  requireClinicManagementBookingEngine: requireClinicManagementBookingEngineMock,
}));

vi.mock('@/app-layer/principal/withOrganizationPrincipal', () => ({
  withDoctorWorkspacePrincipal: withDoctorWorkspacePrincipalMock,
}));

import { POST } from './route';

const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';
const FOREIGN_ORGANIZATION_ID = '22222222-2222-4222-8222-222222222222';
const SPECIALIST_ID = '33333333-3333-4333-8333-333333333333';
const SERVICE_ID = '44444444-4444-4444-8444-444444444444';
const BRANCH_ID = '55555555-5555-4555-8555-555555555555';

function request(): Request {
  return new Request('http://localhost/api/admin/booking-engine/availability', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      kind: 'solo_service_location',
      specialistId: SPECIALIST_ID,
      serviceId: SERVICE_ID,
      branchId: BRANCH_ID,
      isActive: true,
    }),
  });
}

describe('/api/admin/booking-engine/availability solo command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    withDoctorWorkspacePrincipalMock.mockImplementation(
      async (_ctx: unknown, _source: string, callback: () => Promise<unknown>) => callback(),
    );
    getServiceMock.mockResolvedValue({ id: SERVICE_ID, organizationId: ORGANIZATION_ID });
    getBranchMock.mockResolvedValue({ id: BRANCH_ID, organizationId: ORGANIZATION_ID });
    getSpecialistMock.mockResolvedValue({ id: SPECIALIST_ID, organizationId: ORGANIZATION_ID });
    setSoloServiceLocationAvailabilityMock.mockResolvedValue({
      locationAvailability: { id: 'location' },
      specialistAvailability: { id: 'specialist' },
    });
    requireClinicManagementBookingEngineMock.mockResolvedValue({
      ok: true,
      ctx: {
        organizationId: ORGANIZATION_ID,
        service: {
          catalog: { getBranch: getBranchMock, getSpecialist: getSpecialistMock },
          services: {
            getService: getServiceMock,
            setSoloServiceLocationAvailability: setSoloServiceLocationAvailabilityMock,
          },
        },
      },
    });
  });

  it('normalizes location and specialist availability with one organization-scoped command', async () => {
    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(setSoloServiceLocationAvailabilityMock).toHaveBeenCalledOnce();
    expect(setSoloServiceLocationAvailabilityMock).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      specialistId: SPECIALIST_ID,
      serviceId: SERVICE_ID,
      branchId: BRANCH_ID,
      isActive: true,
    });
    expect(withDoctorWorkspacePrincipalMock).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: ORGANIZATION_ID }),
      'admin.booking-engine.availability.solo-service-location.set',
      expect.any(Function),
    );
  });

  it.each([
    ['service', getServiceMock, 'service_not_found'],
    ['branch', getBranchMock, 'branch_not_found'],
    ['specialist', getSpecialistMock, 'specialist_not_found'],
  ])('rejects a %s owned by another organization', async (_entity, lookup, expectedError) => {
    lookup.mockResolvedValueOnce({ organizationId: FOREIGN_ORGANIZATION_ID });

    const response = await POST(request());
    const body = (await response.json()) as { error?: string };

    expect(response.status).toBe(404);
    expect(body.error).toBe(expectedError);
    expect(setSoloServiceLocationAvailabilityMock).not.toHaveBeenCalled();
    expect(withDoctorWorkspacePrincipalMock).toHaveBeenCalledOnce();
  });
});
