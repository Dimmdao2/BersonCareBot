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
import { SaasBillingTariffDowngradeBlockedError } from '@/modules/saas-billing/service';

const organizationId = '11111111-1111-4111-8111-111111111111';
const tariffId = '22222222-2222-4222-8222-222222222222';

describe('/api/clinic/billing tariff change', () => {
  const getOrganizationBillingOverview = vi.fn();
  const getOwnTariffChangeState = vi.fn();
  const scheduleOwnTariffChange = vi.fn();
  const cancelOwnTariffChange = vi.fn();
  const updateOwnBillingEmail = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    fakes.requireClinicManagementApiContext.mockResolvedValue({
      ok: true,
      ctx: { organizationId, membershipRole: 'owner', session: { user: { userId: 'actor' } } },
    });
    fakes.buildAppDeps.mockReturnValue({
      saasBilling: {
        getOrganizationBillingOverview,
        getOwnTariffChangeState,
        scheduleOwnTariffChange,
        cancelOwnTariffChange,
        updateOwnBillingEmail,
      },
    });
  });

  it('returns choices and the pending effective date from the single billing route', async () => {
    getOrganizationBillingOverview.mockResolvedValue({
      organizationId,
      subscriptions: [],
      invoices: [],
    });
    getOwnTariffChangeState.mockResolvedValue({
      choices: [{ id: tariffId, name: 'Меньше' }],
      currentTariffId: 'current',
      pendingTariffId: tariffId,
      pendingEffectiveAt: '2026-09-01T00:00:00.000Z',
    });

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      tariffChange: { pendingTariffId: tariffId, pendingEffectiveAt: '2026-09-01T00:00:00.000Z' },
    });
  });

  it('schedules through the service and exposes a blocker before any payment path', async () => {
    scheduleOwnTariffChange.mockRejectedValue(
      new SaasBillingTariffDowngradeBlockedError([{ mechanic: 'branches', reason: 'quota_exceeded' }]),
    );

    const response = await PATCH(
      new Request('http://test/api/clinic/billing', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tariffId }),
      }),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'saas_billing_tariff_downgrade_blocked',
      blocks: [{ mechanic: 'branches', reason: 'quota_exceeded' }],
    });
  });

  it('stores the clinic receipt email through the own billing principal', async () => {
    updateOwnBillingEmail.mockResolvedValue('payer@example.test');

    const response = await PATCH(
      new Request('http://test/api/clinic/billing', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'billing_contact', billingEmail: 'PAYER@example.test' }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      billingEmail: 'payer@example.test',
    });
    expect(updateOwnBillingEmail).toHaveBeenCalledWith({
      organizationId,
      billingEmail: 'PAYER@example.test',
    });
  });

  it('returns the server-derived upgrade checkout from the existing billing route', async () => {
    scheduleOwnTariffChange.mockResolvedValue({
      outcome: 'checkout',
      invoice: { id: 'upgrade-invoice', providerCheckoutUrl: 'https://pay.example/upgrade' },
    });

    const response = await PATCH(
      new Request('http://test/api/clinic/billing', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          tariffId,
          organizationId: 'attacker-org',
          amountMinor: 1,
          currency: 'USD',
          periodStartsAt: '2099-01-01T00:00:00.000Z',
          periodEndsAt: '2099-01-02T00:00:00.000Z',
        }),
      }),
    );

    await expect(response.json()).resolves.toEqual({
      ok: true,
      invoiceId: 'upgrade-invoice',
      checkoutUrl: 'https://pay.example/upgrade',
    });
    expect(scheduleOwnTariffChange).toHaveBeenCalledWith({
      organizationId,
      tariffId,
      actorId: 'actor',
    });
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
    fakes.buildAppDeps.mockReturnValue({
      orgEntitlements: { resolveMechanicAccess: async () => ({ state: 'active', warning: null }) },
      saasBilling: { purchaseSeatOverage },
    });
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

    const response = await POST(
      request({
        purchase: 'seat_overage',
        requestKey: 'stable-key',
        amountMinor: 15_000,
        currency: 'RUB',
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, outcome: 'seat_available' });
  });

  it('returns the fresh server quote without an invoice when the price changed', async () => {
    purchaseSeatOverage.mockResolvedValue({
      outcome: 'price_changed',
      priceMinor: 18_000,
      currency: 'RUB',
    });

    const response = await POST(
      request({
        purchase: 'seat_overage',
        requestKey: 'stable-key',
        amountMinor: 15_000,
        currency: 'RUB',
      }),
    );

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

    const response = await POST(
      request({
        purchase: 'seat_overage',
        requestKey: 'stable-key',
        amountMinor: 15_000,
        currency: 'RUB',
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      checkoutUrl: 'https://pay.example/seat',
      invoiceId: 'seat-invoice',
    });
  });

  it('rejects a direct seat purchase in read-only before the billing service', async () => {
    fakes.buildAppDeps.mockReturnValue({
      orgEntitlements: {
        resolveMechanicAccess: async () => ({ state: 'read_only', warning: null }),
      },
      saasBilling: { purchaseSeatOverage },
    });

    const response = await POST(
      request({
        purchase: 'seat_overage',
        requestKey: 'stable-key',
        amountMinor: 15_000,
        currency: 'RUB',
      }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: 'commercial_read_only' });
    expect(purchaseSeatOverage).not.toHaveBeenCalled();
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

  it('names an incomplete fiscal setup instead of hiding it as an invoice failure', async () => {
    createOwnTariffRenewalInvoice.mockRejectedValue(
      new Error('saas_billing_receipt_vat_code_missing'),
    );

    const response = await POST(new Request('http://test/api/clinic/billing', { method: 'POST' }));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'saas_billing_receipt_vat_code_missing',
    });
  });
});
