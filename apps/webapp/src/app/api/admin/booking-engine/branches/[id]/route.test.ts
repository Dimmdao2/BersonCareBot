import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireClinicManagementBookingEngineMock = vi.hoisted(() => vi.fn());
const getBranchMock = vi.hoisted(() => vi.fn());
const upsertBranchMock = vi.hoisted(() => vi.fn());
const deactivateBranchMock = vi.hoisted(() => vi.fn());
const withDoctorWorkspacePrincipalMock = vi.hoisted(() =>
  vi.fn(async (_ctx: unknown, _source: string, callback: () => Promise<unknown>) => callback()),
);

vi.mock('../../_requireAdminBookingEngine', () => ({
  requireClinicManagementBookingEngine: requireClinicManagementBookingEngineMock,
}));
vi.mock('@/app-layer/principal/withOrganizationPrincipal', () => ({
  withDoctorWorkspacePrincipal: withDoctorWorkspacePrincipalMock,
}));

import { DELETE, PATCH } from './route';

const ONLINE = {
  id: 'online-a',
  organizationId: 'org-a',
  title: 'Онлайн',
  shortTitle: 'Онлайн',
  color: '#7c3aed',
  cityCode: 'online',
  address: null,
  timezone: 'Europe/Moscow',
  isActive: true,
  sortOrder: 20,
};

describe('generic branch CRUD protects the built-in Online location', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireClinicManagementBookingEngineMock.mockResolvedValue({
      ok: true,
      ctx: {
        organizationId: 'org-a',
        service: {
          catalog: {
            getBranch: getBranchMock,
            upsertBranch: upsertBranchMock,
            deactivateBranch: deactivateBranchMock,
          },
        },
      },
    });
    getBranchMock.mockResolvedValue(ONLINE);
  });

  it('cannot rename or deactivate Online through the generic PATCH route', async () => {
    const res = await PATCH(
      new Request('http://localhost', {
        method: 'PATCH',
        body: JSON.stringify({ title: 'Другое' }),
      }),
      { params: Promise.resolve({ id: ONLINE.id }) },
    );
    expect(res.status).toBe(409);
    expect(upsertBranchMock).not.toHaveBeenCalled();
  });

  it('cannot delete Online through the generic DELETE route', async () => {
    const res = await DELETE(new Request('http://localhost', { method: 'DELETE' }), {
      params: Promise.resolve({ id: ONLINE.id }),
    });
    expect(res.status).toBe(409);
    expect(deactivateBranchMock).not.toHaveBeenCalled();
  });

  it("does not reveal or mutate a foreign organization's Online row", async () => {
    getBranchMock.mockResolvedValueOnce({ ...ONLINE, organizationId: 'org-b' });
    const res = await PATCH(
      new Request('http://localhost', {
        method: 'PATCH',
        body: JSON.stringify({ isActive: false }),
      }),
      { params: Promise.resolve({ id: ONLINE.id }) },
    );
    expect(res.status).toBe(404);
    expect(upsertBranchMock).not.toHaveBeenCalled();
  });
});
