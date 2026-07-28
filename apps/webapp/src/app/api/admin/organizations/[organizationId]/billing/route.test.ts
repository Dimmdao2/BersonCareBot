import { beforeEach, describe, expect, it, vi } from 'vitest';

const guardMock = vi.hoisted(() => vi.fn());
const buildAppDepsMock = vi.hoisted(() => vi.fn());
const getOrganizationBillingOverviewMock = vi.hoisted(() => vi.fn());

vi.mock('@/app-layer/guards/requireRole', () => ({
  requirePlatformOperationsApiContext: guardMock,
}));

vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: buildAppDepsMock,
}));

import { GET } from './route';

const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';
const PLATFORM_USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const emptyBilling = {
  organizationId: ORGANIZATION_ID,
  subscriptions: [],
  invoices: [],
  providerEvents: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  buildAppDepsMock.mockReturnValue({
    saasBilling: {
      getOrganizationBillingOverview: getOrganizationBillingOverviewMock,
    },
  });
});

describe('GET /api/admin/organizations/[organizationId]/billing', () => {
  it('returns one clinic billing overview after the platform principal guard', async () => {
    guardMock.mockResolvedValue({
      ok: true,
      session: { user: { userId: PLATFORM_USER_ID } },
    });
    getOrganizationBillingOverviewMock.mockResolvedValue(emptyBilling);

    const response = await GET(new Request('http://localhost'), {
      params: Promise.resolve({ organizationId: ORGANIZATION_ID }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, billing: emptyBilling });
    expect(getOrganizationBillingOverviewMock).toHaveBeenCalledWith(ORGANIZATION_ID);
    expect(guardMock.mock.invocationCallOrder[0]).toBeLessThan(
      buildAppDepsMock.mock.invocationCallOrder[0]!,
    );
  });

  it('denies a doctor from another clinic before resolving billing repositories', async () => {
    guardMock.mockResolvedValue({
      ok: false,
      response: Response.json({ ok: false, error: 'forbidden' }, { status: 403 }),
    });

    const response = await GET(new Request('http://localhost'), {
      params: Promise.resolve({ organizationId: ORGANIZATION_ID }),
    });

    expect(response.status).toBe(403);
    expect(buildAppDepsMock).not.toHaveBeenCalled();
    expect(getOrganizationBillingOverviewMock).not.toHaveBeenCalled();
  });
});
