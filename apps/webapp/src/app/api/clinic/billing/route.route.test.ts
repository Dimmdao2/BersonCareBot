import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  buildAppDeps: vi.fn(),
  requireClinicManagementApiContext: vi.fn(),
}));

vi.mock('@/app-layer/di/buildAppDeps', () => ({ buildAppDeps: fakes.buildAppDeps }));
vi.mock('@/app-layer/guards/requireRole', () => ({
  requireClinicManagementApiContext: fakes.requireClinicManagementApiContext,
}));
vi.mock('@bersoncare/db-principal', () => ({
  runWithDbClinicBillingPrincipal: (_input: unknown, work: () => unknown) => work(),
}));

import { DELETE, GET, PATCH } from './route';

const organizationId = '11111111-1111-4111-8111-111111111111';
const tariffId = '22222222-2222-4222-8222-222222222222';

describe('/api/clinic/billing tariff change', () => {
  const getOrganizationBillingOverview = vi.fn();
  const getOwnTariffChangeState = vi.fn();
  const scheduleOwnTariffChange = vi.fn();
  const cancelOwnTariffChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    fakes.requireClinicManagementApiContext.mockResolvedValue({
      ok: true,
      ctx: { organizationId, membershipRole: 'owner', session: { user: { userId: 'actor' } } },
    });
    fakes.buildAppDeps.mockReturnValue({ saasBilling: {
      getOrganizationBillingOverview,
      getOwnTariffChangeState,
      scheduleOwnTariffChange,
      cancelOwnTariffChange,
    } });
  });

  it('returns choices and the pending effective date from the single billing route', async () => {
    getOrganizationBillingOverview.mockResolvedValue({ organizationId, subscriptions: [], invoices: [] });
    getOwnTariffChangeState.mockResolvedValue({
      choices: [{ id: tariffId, name: 'Меньше' }], currentTariffId: 'current', pendingTariffId: tariffId,
      pendingEffectiveAt: '2026-09-01T00:00:00.000Z',
    });

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      tariffChange: { pendingTariffId: tariffId, pendingEffectiveAt: '2026-09-01T00:00:00.000Z' },
    });
  });

  it('schedules through the service and exposes a blocker before any payment path', async () => {
    scheduleOwnTariffChange.mockRejectedValue(new Error('saas_billing_tariff_downgrade_blocked'));

    const response = await PATCH(new Request('http://test/api/clinic/billing', {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tariffId }),
    }));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ ok: false, error: 'saas_billing_tariff_downgrade_blocked' });
  });

  it('cancels the pending change without creating an invoice', async () => {
    const response = await DELETE();

    expect(response.status).toBe(200);
    expect(cancelOwnTariffChange).toHaveBeenCalledWith({ organizationId, actorId: 'actor' });
  });
});
