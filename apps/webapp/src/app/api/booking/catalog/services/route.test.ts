import { describe, expect, it, vi } from 'vitest';

const getCurrentSessionMock = vi.hoisted(() => vi.fn());
const resolveActiveOrganizationForPatientMock = vi.hoisted(() => vi.fn());
const listBranchesMock = vi.hoisted(() => vi.fn());
const getBranchMock = vi.hoisted(() => vi.fn());
const listSpecialistsMock = vi.hoisted(() => vi.fn());
const listServicesMock = vi.hoisted(() => vi.fn());
const listServiceLocationAvailabilityMock = vi.hoisted(() => vi.fn());
const listSpecialistServiceAvailabilityMock = vi.hoisted(() => vi.fn());

vi.mock('@/modules/auth/service', () => ({
  getCurrentSession: getCurrentSessionMock,
}));

vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: () => ({
    patientOrganization: {
      resolveActiveOrganizationForPatient: resolveActiveOrganizationForPatientMock,
    },
    bookingEngine: {
      catalog: {
        listBranches: listBranchesMock,
        getBranch: getBranchMock,
        listSpecialists: listSpecialistsMock,
      },
      services: {
        listServices: listServicesMock,
        listServiceLocationAvailability: listServiceLocationAvailabilityMock,
        listSpecialistServiceAvailability: listSpecialistServiceAvailabilityMock,
      },
    },
  }),
}));

import { GET } from './route';

const patientClientSession = {
  user: { userId: 'u1', role: 'client' as const, phone: '+79990001122' },
};
const ORG_ID = '22222222-2222-4222-8222-222222222222';

resolveActiveOrganizationForPatientMock.mockResolvedValue({ ok: true, organizationId: ORG_ID });

describe('GET /api/booking/catalog/services', () => {
  it('returns 400 without cityCode', async () => {
    getCurrentSessionMock.mockResolvedValue(patientClientSession);
    const res = await GET(new Request('http://localhost/api/booking/catalog/services'));
    expect(res.status).toBe(400);
  });

  it('returns 404 when city_not_found', async () => {
    getCurrentSessionMock.mockResolvedValue(patientClientSession);
    listBranchesMock.mockResolvedValue([]);
    const res = await GET(
      new Request('http://localhost/api/booking/catalog/services?cityCode=unknown'),
    );
    expect(res.status).toBe(404);
  });
});
