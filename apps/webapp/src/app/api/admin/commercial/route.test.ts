import { beforeEach, describe, expect, it, vi } from 'vitest';

const guardMock = vi.hoisted(() => vi.fn());
const listTariffsMock = vi.hoisted(() => vi.fn());
const listOrganizationsMock = vi.hoisted(() => vi.fn());
const getTrialPolicyMock = vi.hoisted(() => vi.fn());
const createTariffMock = vi.hoisted(() => vi.fn());
const archiveTariffMock = vi.hoisted(() => vi.fn());
const upsertOverrideMock = vi.hoisted(() => vi.fn());
const setTrialPolicyMock = vi.hoisted(() => vi.fn());

vi.mock('@/app-layer/guards/requireRole', () => ({
  requirePlatformOperationsApiContext: guardMock,
}));

vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: vi.fn(() => ({
    platformEntitlements: {
      listTariffs: listTariffsMock,
      listOrganizations: listOrganizationsMock,
      getTrialPolicy: getTrialPolicyMock,
      createTariff: createTariffMock,
      archiveTariff: archiveTariffMock,
      upsertOverride: upsertOverrideMock,
      setTrialPolicy: setTrialPolicyMock,
    },
  })),
}));

import { GET, POST } from './route';

const ACTOR_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

beforeEach(() => {
  guardMock.mockReset();
  listTariffsMock.mockReset();
  listOrganizationsMock.mockReset();
  getTrialPolicyMock.mockReset();
  createTariffMock.mockReset();
  archiveTariffMock.mockReset();
  upsertOverrideMock.mockReset();
  setTrialPolicyMock.mockReset();
});

describe('/api/admin/commercial', () => {
  it('does not reach commercial data when the platform guard denies access', async () => {
    guardMock.mockResolvedValueOnce({
      ok: false,
      response: Response.json({ ok: false, error: 'forbidden' }, { status: 403 }),
    });

    const response = await GET();

    expect(response.status).toBe(403);
    expect(listTariffsMock).not.toHaveBeenCalled();
    expect(listOrganizationsMock).not.toHaveBeenCalled();
  });

  it('returns the platform commercial constructor state', async () => {
    guardMock.mockResolvedValueOnce({ ok: true, session: { user: { userId: ACTOR_ID } } });
    listTariffsMock.mockResolvedValueOnce([{ id: 'tariff-1', name: 'Базовый' }]);
    listOrganizationsMock.mockResolvedValueOnce([{ id: 'org-1', title: 'Клиника' }]);
    getTrialPolicyMock.mockResolvedValueOnce(null);

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      tariffs: [{ name: 'Базовый' }],
      organizations: [{ title: 'Клиника' }],
      trialPolicy: null,
    });
  });

  it('passes the authenticated actor and required reason into an audited mutation', async () => {
    guardMock.mockResolvedValueOnce({ ok: true, session: { user: { userId: ACTOR_ID } } });
    createTariffMock.mockResolvedValueOnce({ id: 'created' });

    const response = await POST(
      new Request('http://test/api/admin/commercial', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'create_tariff',
          reason: 'Новый публичный тариф',
          tariff: {
            name: 'Базовый',
            description: '',
            priceMinor: 100000,
            currency: 'RUB',
            billingPeriod: 'month',
            mechanics: { booking: true },
            quotas: {},
            includedSeats: 1,
            isActive: true,
          },
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(createTariffMock).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Базовый', mechanics: { booking: true } }),
      { actorId: ACTOR_ID, reason: 'Новый публичный тариф' },
    );
  });

  it('accepts a mutation with a blank audit reason (owner 2026-07-26, #1003: reason is no longer required)', async () => {
    guardMock.mockResolvedValueOnce({ ok: true, session: { user: { userId: ACTOR_ID } } });
    archiveTariffMock.mockResolvedValueOnce(undefined);

    const response = await POST(
      new Request('http://test/api/admin/commercial', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'archive_tariff', tariffId: ACTOR_ID, reason: '' }),
      }),
    );

    expect(response.status).toBe(200);
    expect(archiveTariffMock).toHaveBeenCalledWith(ACTOR_ID, { actorId: ACTOR_ID, reason: '' });
  });

  it('still rejects a reason over the 500-char audit-row cap', async () => {
    guardMock.mockResolvedValueOnce({ ok: true, session: { user: { userId: ACTOR_ID } } });

    const response = await POST(
      new Request('http://test/api/admin/commercial', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'archive_tariff',
          tariffId: ACTOR_ID,
          reason: 'x'.repeat(501),
        }),
      }),
    );

    expect(response.status).toBe(400);
    expect(archiveTariffMock).not.toHaveBeenCalled();
  });

  it('passes a typed exact-organization quota override to the platform service', async () => {
    guardMock.mockResolvedValueOnce({ ok: true, session: { user: { userId: ACTOR_ID } } });
    upsertOverrideMock.mockResolvedValueOnce(undefined);
    const organizationId = '11111111-1111-4111-8111-111111111111';

    const response = await POST(
      new Request('http://test/api/admin/commercial', {
        method: 'POST',
        body: JSON.stringify({
          action: 'upsert_override',
          organizationId,
          mechanic: 'files',
          enabled: true,
          quota: {
            kind: 'numeric',
            limit: 2048,
            unit: 'bytes',
            period: 'month',
            usagePolicy: 'consumption',
          },
          expiresAt: '2027-01-01T00:00:00.000Z',
          reason: 'Временный лимит для клиники',
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(upsertOverrideMock).toHaveBeenCalledWith(
      {
        organizationId,
        mechanic: 'files',
        enabled: true,
        quota: {
          kind: 'numeric',
          limit: 2048,
          unit: 'bytes',
          period: 'month',
          usagePolicy: 'consumption',
        },
        expiresAt: '2027-01-01T00:00:00.000Z',
      },
      { actorId: ACTOR_ID, reason: 'Временный лимит для клиники' },
    );
  });

  it('rejects unsupported future trial start events', async () => {
    guardMock.mockResolvedValueOnce({ ok: true, ctx: { actorId: ACTOR_ID } });
    const response = await POST(
      new Request('http://test/api/admin/commercial', {
        method: 'POST',
        body: JSON.stringify({
          action: 'set_trial_policy',
          reason: 'unsupported hook',
          policy: {
            tariffId: ACTOR_ID,
            durationDays: 30,
            graceDays: 5,
            startEvent: 'email_verified',
            postTrialBehavior: 'read_only',
            postTrialTariffId: null,
            isActive: true,
          },
        }),
      }),
    );
    expect(response.status).toBe(400);
    expect(setTrialPolicyMock).not.toHaveBeenCalled();
  });
});
