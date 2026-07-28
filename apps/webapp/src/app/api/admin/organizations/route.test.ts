import { beforeEach, describe, expect, it, vi } from 'vitest';

const guardMock = vi.hoisted(() => vi.fn());
const buildAppDepsMock = vi.hoisted(() => vi.fn());
const listOrganizationsMock = vi.hoisted(() => vi.fn());
const listTariffsMock = vi.hoisted(() => vi.fn());
const getEnforcedQuotaUsageMock = vi.hoisted(() => vi.fn());

vi.mock('@/app-layer/guards/requireRole', () => ({
  requirePlatformOperationsApiContext: guardMock,
}));

vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: buildAppDepsMock,
}));

import { GET } from './route';

const PLATFORM_USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';

beforeEach(() => {
  guardMock.mockReset();
  buildAppDepsMock.mockReset();
  listOrganizationsMock.mockReset();
  listTariffsMock.mockReset();
  getEnforcedQuotaUsageMock.mockReset();
  buildAppDepsMock.mockReturnValue({
    platformEntitlements: {
      listOrganizations: listOrganizationsMock,
      listTariffs: listTariffsMock,
    },
    orgEntitlements: {
      getEnforcedQuotaUsage: getEnforcedQuotaUsageMock,
    },
  });
});

describe('GET /api/admin/organizations', () => {
  it('returns the clinic list to a platform administrator after the principal-establishing guard', async () => {
    guardMock.mockResolvedValueOnce({
      ok: true,
      session: { user: { userId: PLATFORM_USER_ID } },
    });
    listOrganizationsMock.mockResolvedValueOnce([
      {
        id: ORGANIZATION_ID,
        title: 'Клиника восстановления',
        tariffId: null,
        manualTariffId: null,
        isActive: true,
        commercialAccessState: 'no_trial',
        effectiveAccess: { lifecycle: 'active', tariffId: null, source: 'no_trial' },
        overrides: [],
        trial: null,
      },
    ]);
    listTariffsMock.mockResolvedValueOnce([]);
    getEnforcedQuotaUsageMock.mockResolvedValueOnce({
      courses: 7,
      // A repository returning a placeholder for a non-enforced mechanic must not make it public.
      files: 0,
    });

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      organizations: [{ id: ORGANIZATION_ID, title: 'Клиника восстановления' }],
      tariffs: [],
      enforcedQuotaUsage: { [ORGANIZATION_ID]: { courses: 7 } },
    });
    expect(guardMock.mock.invocationCallOrder[0]).toBeLessThan(
      buildAppDepsMock.mock.invocationCallOrder[0]!,
    );
    expect(getEnforcedQuotaUsageMock).toHaveBeenCalledWith(ORGANIZATION_ID);
  });

  it('denies a clinic-scoped user without touching repositories', async () => {
    guardMock.mockResolvedValueOnce({
      ok: false,
      response: Response.json({ ok: false, error: 'forbidden' }, { status: 403 }),
    });

    const response = await GET();

    expect(response.status).toBe(403);
    expect(buildAppDepsMock).not.toHaveBeenCalled();
    expect(listOrganizationsMock).not.toHaveBeenCalled();
    expect(getEnforcedQuotaUsageMock).not.toHaveBeenCalled();
  });

  it('keeps the clinic list readable when the optional real usage counter is unavailable', async () => {
    guardMock.mockResolvedValueOnce({
      ok: true,
      session: { user: { userId: PLATFORM_USER_ID } },
    });
    listOrganizationsMock.mockResolvedValueOnce([
      {
        id: ORGANIZATION_ID,
        title: 'Клиника восстановления',
        tariffId: null,
        manualTariffId: null,
        isActive: true,
        commercialAccessState: 'no_trial',
        effectiveAccess: { lifecycle: 'active', tariffId: null, source: 'no_trial' },
        overrides: [],
        trial: null,
      },
    ]);
    listTariffsMock.mockResolvedValueOnce([]);
    getEnforcedQuotaUsageMock.mockRejectedValueOnce(new Error('counter_unavailable'));

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      organizations: [{ id: ORGANIZATION_ID }],
      enforcedQuotaUsage: { [ORGANIZATION_ID]: {} },
    });
  });
});
