import { beforeEach, describe, expect, it, vi } from 'vitest';

const guardMock = vi.hoisted(() => vi.fn());
const buildAppDepsMock = vi.hoisted(() => vi.fn());
const getOrganizationBillingOverviewMock = vi.hoisted(() => vi.fn());
const runWithDbClinicBillingPrincipalMock = vi.hoisted(() =>
  vi.fn((_principal: unknown, fn: () => unknown) => fn()),
);

vi.mock('@bersoncare/db-principal', () => ({
  runWithDbClinicBillingPrincipal: runWithDbClinicBillingPrincipalMock,
}));

vi.mock('@/app-layer/guards/requireRole', () => ({
  requireClinicManagementApiContext: guardMock,
}));

vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: buildAppDepsMock,
}));

import { GET } from './route';

const OWNER_ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';
const FOREIGN_ORGANIZATION_ID = '22222222-2222-4222-8222-222222222222';

beforeEach(() => {
  vi.clearAllMocks();
  buildAppDepsMock.mockReturnValue({
    saasBilling: {
      getOrganizationBillingOverview: getOrganizationBillingOverviewMock,
    },
  });
});

describe('GET /api/clinic/billing', () => {
  it('returns only the organization resolved from the owner membership', async () => {
    const billing = {
      organizationId: OWNER_ORGANIZATION_ID,
      subscriptions: [],
      invoices: [],
      providerEvents: [],
    };
    guardMock.mockResolvedValue({
      ok: true,
      ctx: {
        organizationId: OWNER_ORGANIZATION_ID,
        membershipRole: 'owner',
        session: { user: { userId: '33333333-3333-4333-8333-333333333333' } },
      },
    });
    getOrganizationBillingOverviewMock.mockResolvedValue(billing);

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      billing: {
        organizationId: OWNER_ORGANIZATION_ID,
        subscriptions: [],
        invoices: [],
      },
    });
    expect(getOrganizationBillingOverviewMock).toHaveBeenCalledWith(OWNER_ORGANIZATION_ID);
    expect(runWithDbClinicBillingPrincipalMock).toHaveBeenCalledWith(
      {
        organizationId: OWNER_ORGANIZATION_ID,
        platformUserId: '33333333-3333-4333-8333-333333333333',
        source: 'clinic-billing-read',
      },
      expect.any(Function),
    );
    expect(getOrganizationBillingOverviewMock).not.toHaveBeenCalledWith(FOREIGN_ORGANIZATION_ID);
    expect(guardMock.mock.invocationCallOrder[0]).toBeLessThan(
      buildAppDepsMock.mock.invocationCallOrder[0]!,
    );
  });

  it('denies an ordinary doctor from a foreign clinic before billing repository access', async () => {
    guardMock.mockResolvedValue({
      ok: false,
      response: Response.json({ ok: false, error: 'forbidden' }, { status: 403 }),
    });

    const response = await GET();

    expect(response.status).toBe(403);
    expect(buildAppDepsMock).not.toHaveBeenCalled();
  });

  it('allows the clinic admin through the dedicated billing read path', async () => {
    guardMock.mockResolvedValue({
      ok: true,
      ctx: {
        organizationId: OWNER_ORGANIZATION_ID,
        membershipRole: 'admin',
        session: { user: { userId: '44444444-4444-4444-8444-444444444444' } },
      },
    });
    getOrganizationBillingOverviewMock.mockResolvedValue({
      organizationId: OWNER_ORGANIZATION_ID,
      subscriptions: [],
      invoices: [],
      providerEvents: [],
    });

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      billing: {
        organizationId: OWNER_ORGANIZATION_ID,
        subscriptions: [],
        invoices: [],
      },
    });
    expect(getOrganizationBillingOverviewMock).toHaveBeenCalledWith(OWNER_ORGANIZATION_ID);
    expect(runWithDbClinicBillingPrincipalMock).toHaveBeenCalledWith(
      {
        organizationId: OWNER_ORGANIZATION_ID,
        platformUserId: '44444444-4444-4444-8444-444444444444',
        source: 'clinic-billing-read',
      },
      expect.any(Function),
    );
  });
});
