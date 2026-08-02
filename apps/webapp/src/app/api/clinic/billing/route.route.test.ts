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

import { DELETE, GET, PATCH, POST } from './route';

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

describe('POST /api/clinic/billing seat overage purchase', () => {
  const purchaseSeatOverage = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    fakes.requireClinicManagementApiContext.mockResolvedValue({
      ok: true,
      ctx: { organizationId, membershipRole: 'owner', session: { user: { userId: 'actor' } } },
    });
    fakes.buildAppDeps.mockReturnValue({ saasBilling: { purchaseSeatOverage } });
  });

  function request(body: unknown) {
    return new Request('http://test/api/clinic/billing', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  it('does not issue an invoice when a seat became available', async () => {
    purchaseSeatOverage.mockResolvedValue({ outcome: 'seat_available' });

    const response = await POST(request({
      purchase: 'seat_overage', requestKey: 'stable-key', amountMinor: 15_000, currency: 'RUB',
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, outcome: 'seat_available' });
  });

  it('returns the fresh server quote without an invoice when the price changed', async () => {
    purchaseSeatOverage.mockResolvedValue({
      outcome: 'price_changed', priceMinor: 18_000, currency: 'RUB',
    });

    const response = await POST(request({
      purchase: 'seat_overage', requestKey: 'stable-key', amountMinor: 15_000, currency: 'RUB',
    }));

    expect(response.status).toBe(402);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'seat_overage_confirmation_required',
      priceMinor: 18_000,
      currency: 'RUB',
    });
  });

  it('returns the idempotent checkout invoice', async () => {
    purchaseSeatOverage.mockResolvedValue({
      outcome: 'checkout',
      invoice: { id: 'seat-invoice', providerCheckoutUrl: 'https://pay.example/seat' },
    });

    const response = await POST(request({
      purchase: 'seat_overage', requestKey: 'stable-key', amountMinor: 15_000, currency: 'RUB',
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      checkoutUrl: 'https://pay.example/seat',
      invoiceId: 'seat-invoice',
    });
  });

  it('rejects a malformed typed purchase instead of falling through to tariff renewal', async () => {
    const response = await POST(request({ purchase: 'seat_overage', requestKey: '' }));

    expect(response.status).toBe(400);
    expect(purchaseSeatOverage).not.toHaveBeenCalled();
  });
});

describe('POST /api/clinic/billing own-tariff renewal', () => {
  const createOwnTariffRenewalInvoice = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    fakes.requireClinicManagementApiContext.mockResolvedValue({
      ok: true,
      ctx: { organizationId, membershipRole: 'owner', session: { user: { userId: 'actor' } } },
    });
    fakes.buildAppDeps.mockReturnValue({ saasBilling: { createOwnTariffRenewalInvoice } });
  });

  it('returns an honest unavailable-provider response for the bodyless own-tariff checkout', async () => {
    createOwnTariffRenewalInvoice.mockRejectedValue(
      new Error('saas_billing_payment_provider_unavailable:mock'),
    );

    const response = await POST(new Request('http://test/api/clinic/billing', { method: 'POST' }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'saas_billing_payment_provider_unavailable',
    });
    expect(createOwnTariffRenewalInvoice).toHaveBeenCalledWith(organizationId);
  });
});
