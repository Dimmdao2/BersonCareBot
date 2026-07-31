import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  requireClinicManagementApiContext: vi.fn(),
  getOrganizationBillingOverview: vi.fn(),
}));

vi.mock('@/app-layer/guards/requireRole', () => ({
  requireClinicManagementApiContext: fakes.requireClinicManagementApiContext,
}));
vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: () => ({
    saasBilling: { getOrganizationBillingOverview: fakes.getOrganizationBillingOverview },
  }),
}));
vi.mock('@bersoncare/db-principal', () => ({
  runWithDbClinicBillingPrincipal: <T>(_principal: unknown, callback: () => T): T => callback(),
}));

import { GET } from './route';

beforeEach(() => {
  vi.clearAllMocks();
  fakes.requireClinicManagementApiContext.mockResolvedValue({
    ok: true,
    ctx: {
      organizationId: 'org-1',
      membershipRole: 'owner',
      session: { user: { userId: 'user-1' } },
    },
  });
  fakes.getOrganizationBillingOverview.mockResolvedValue({
    organizationId: 'org-1',
    subscriptions: [],
    invoices: [],
    providerEvents: [],
  });
});

describe('§5a/2.1c: clinic billing is the cabinet-block recovery surface', () => {
  it('opens own-tariff billing through the explicit recovery guard', async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    expect(fakes.requireClinicManagementApiContext).toHaveBeenCalledWith({
      allowCabinetRecovery: true,
    });
    expect(fakes.getOrganizationBillingOverview).toHaveBeenCalledWith('org-1');
  });
});
