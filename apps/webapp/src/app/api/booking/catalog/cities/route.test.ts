import { describe, expect, it, vi } from 'vitest';

const getCurrentSessionMock = vi.hoisted(() => vi.fn());
const resolveActiveOrganizationForPatientMock = vi.hoisted(() => vi.fn());
const listBranchesMock = vi.hoisted(() => vi.fn());

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

describe('GET /api/booking/catalog/cities', () => {
  it('returns 401 when not authenticated', async () => {
    getCurrentSessionMock.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('returns cities when catalog available', async () => {
    getCurrentSessionMock.mockResolvedValue(patientClientSession);
    listBranchesMock.mockResolvedValue([
      {
        id: 'b1',
        cityCode: 'moscow',
        title: 'Москва. Точка Здоровья',
        isActive: true,
        sortOrder: 0,
      },
    ]);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.cities).toHaveLength(1);
  });
});
