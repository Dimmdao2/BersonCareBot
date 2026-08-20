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
import { issueSeatOverageQuote } from '@/modules/saas-billing/seatOverageQuote';
import { SaasBillingTariffDowngradeBlockedError } from '@/modules/saas-billing/service';
import { PaymentProviderRequestRefusedError } from '@/modules/payments/providerPort';

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

  it('maps a billing-period capability/read failure to a redacted service response', async () => {
    getOrganizationBillingOverview.mockRejectedValue({
      code: '42501',
      detail: 'permission denied for saas_billing_periods',
    });
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const response = await GET();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'saas_billing_unavailable',
    });
    expect(errorLog).toHaveBeenCalledWith(
      '[clinic-billing] operation failed',
      expect.objectContaining({ operation: 'overview', category: 'repository_unavailable' }),
    );
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain('saas_billing_periods');
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

  it('maps a proven provider refusal to 502 without exposing provider detail', async () => {
    scheduleOwnTariffChange.mockRejectedValue(
      new PaymentProviderRequestRefusedError('provider secret response'),
    );
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const response = await PATCH(
      new Request('http://test/api/clinic/billing', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tariffId }),
      }),
    );

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'saas_billing_provider_refused',
    });
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain('provider secret response');
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

  function quoteFor(
    priceMinor: number,
    organization: string = organizationId,
    // Момент неподвижности цены (Р-15) приходит от двери и задаётся здесь явно, а не берётся у
    // машины.
    priceStableUntil: string = '2999-01-01T00:00:00.000Z',
  ): string {
    return issueSeatOverageQuote({
      organizationId: organization,
      priceMinor,
      currency: 'RUB',
      priceStableUntil,
    }).token;
  }

  it('does not issue an invoice when a seat became available', async () => {
    purchaseSeatOverage.mockResolvedValue({ outcome: 'seat_available' });

    const response = await POST(request({ purchase: 'seat_overage', quote: quoteFor(15_000) }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, outcome: 'seat_available' });
  });

  /**
   * Единственное денежное число, которое видит сервис, приходит из собственной подписи сервера,
   * а не из тела запроса. Пробивается: покупка снова берёт сумму из JSON.
   */
  it('takes the price from its own signed quote, never from the request body', async () => {
    purchaseSeatOverage.mockResolvedValue({ outcome: 'seat_available' });

    await POST(
      request({
        purchase: 'seat_overage',
        quote: quoteFor(15_000),
        // Числа, которые клиент мог бы попытаться навязать: сервер их не читает.
        quotedAmountMinor: 1,
        quotedCurrency: 'RUB',
        priceMinor: 1,
      }),
    );

    expect(purchaseSeatOverage).toHaveBeenCalledWith({
      organizationId,
      quote: expect.objectContaining({ priceMinor: 15_000, currency: 'RUB' }),
    });
  });

  /** Подделанная котировка — не «дешевле», а вообще не покупка. */
  it('refuses a tampered quote without reaching the billing service', async () => {
    const [version, payload, signature] = quoteFor(15_000).split('.');
    const forgedPayload = Buffer.from(
      JSON.stringify({
        ...(JSON.parse(Buffer.from(payload!, 'base64url').toString('utf8')) as object),
        amt: 1,
      }),
      'utf8',
    ).toString('base64url');

    const response = await POST(
      request({ purchase: 'seat_overage', quote: `${version}.${forgedPayload}.${signature}` }),
    );

    expect(response.status).toBe(402);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'seat_overage_quote_expired',
    });
    expect(purchaseSeatOverage).not.toHaveBeenCalled();
  });

  /**
   * Котировка выписана конкретной клинике. Валидная подпись чужой организации не делает покупку
   * своей — иначе одна клиника покупала бы место по цене другой.
   */
  it('refuses a validly signed quote issued to another clinic', async () => {
    const response = await POST(
      request({
        purchase: 'seat_overage',
        quote: quoteFor(15_000, '33333333-3333-4333-8333-333333333333'),
      }),
    );

    expect(response.status).toBe(402);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'seat_overage_quote_expired',
    });
    expect(purchaseSeatOverage).not.toHaveBeenCalled();
  });

  /**
   * Просроченная котировка не перевыпускается молча: цена, которую человек видел, больше не
   * действует, и решение принимает он, а не сервер.
   */
  it('refuses an expired quote instead of repricing it', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-08-19T10:00:00.000Z'));
      const quote = quoteFor(15_000);
      vi.setSystemTime(new Date('2026-08-19T10:15:01.000Z'));

      const response = await POST(request({ purchase: 'seat_overage', quote }));

      expect(response.status).toBe(402);
      await expect(response.json()).resolves.toEqual({
        ok: false,
        error: 'seat_overage_quote_expired',
      });
      expect(purchaseSeatOverage).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  /**
   * Цена округляется по целым суткам UTC, поэтому котировка не имеет права пережить полночь: за
   * полночью остаток оплаченного периода короче и место дешевле. Прежняя сверка сумм отказывала
   * ровно здесь — отказ сохранён.
   */
  it('refuses a quote that would cross the clinic day boundary its price is rounded by', async () => {
    vi.useFakeTimers();
    try {
      // Конец московских суток 19.08 — 21:00 UTC. Именно в этот момент цена места пересчитывается
      // на новый, более короткий остаток периода (Р-15), поэтому котировка его не переживает.
      vi.setSystemTime(new Date('2026-08-19T20:55:00.000Z'));
      const quote = quoteFor(15_000, organizationId, '2026-08-19T21:00:00.000Z');
      vi.setSystemTime(new Date('2026-08-19T21:00:00.000Z'));

      const response = await POST(request({ purchase: 'seat_overage', quote }));

      expect(response.status).toBe(402);
      await expect(response.json()).resolves.toMatchObject({
        error: 'seat_overage_quote_expired',
      });
      expect(purchaseSeatOverage).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('returns the fresh server quote without an invoice when the price changed', async () => {
    purchaseSeatOverage.mockResolvedValue({
      outcome: 'price_changed',
      priceMinor: 18_000,
      currency: 'RUB',
      priceStableUntil: '2999-01-01T00:00:00.000Z',
    });

    const response = await POST(request({ purchase: 'seat_overage', quote: quoteFor(15_000) }));

    expect(response.status).toBe(402);
    const body = (await response.json()) as {
      ok: boolean;
      error: string;
      quote: string;
      priceMinor: number;
      currency: string;
    };
    expect(body).toMatchObject({
      ok: false,
      error: 'seat_overage_confirmation_required',
      priceMinor: 18_000,
      currency: 'RUB',
    });
    // Экран получает НОВУЮ цену вместе с котировкой на неё — подтверждает снова человек.
    purchaseSeatOverage.mockResolvedValue({ outcome: 'seat_available' });
    await POST(request({ purchase: 'seat_overage', quote: body.quote }));
    expect(purchaseSeatOverage).toHaveBeenLastCalledWith({
      organizationId,
      quote: expect.objectContaining({ priceMinor: 18_000 }),
    });
  });

  /**
   * Р-15 в действующей редакции: место уже открыто, счёт выставлен. Ответ называет сумму и срок —
   * их показывает экран команды, — а ссылка на оплату идёт довеском, потому что доступ она больше
   * не решает.
   */
  it('reports the opened seat and the issued invoice, idempotently', async () => {
    purchaseSeatOverage.mockResolvedValue({
      outcome: 'seat_opened',
      invoice: {
        id: 'seat-invoice',
        amountMinor: 15_000,
        currency: 'RUB',
        expiresAt: '2026-08-19T12:00:00.000Z',
        providerCheckoutUrl: 'https://pay.example/seat',
      },
    });

    const response = await POST(request({ purchase: 'seat_overage', quote: quoteFor(15_000) }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      outcome: 'seat_opened',
      invoiceId: 'seat-invoice',
      amountMinor: 15_000,
      currency: 'RUB',
      invoiceExpiresAt: '2026-08-19T12:00:00.000Z',
      checkoutUrl: 'https://pay.example/seat',
    });
  });

  /**
   * Пробивается: отсутствие ссылки на оплату снова отвечает 502, то есть уже открытое место
   * выглядит для экрана как несостоявшееся действие.
   */
  it('still reports the opened seat when the provider returned no payment link', async () => {
    purchaseSeatOverage.mockResolvedValue({
      outcome: 'seat_opened',
      invoice: {
        id: 'seat-invoice',
        amountMinor: 15_000,
        currency: 'RUB',
        expiresAt: '2026-08-19T12:00:00.000Z',
        providerCheckoutUrl: null,
      },
    });

    const response = await POST(request({ purchase: 'seat_overage', quote: quoteFor(15_000) }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, outcome: 'seat_opened' });
  });

  /**
   * Двойной клик — это дважды одна и та же котировка, значит один и тот же `purchaseKey`, значит
   * один и тот же ключ идемпотентности провайдера. Второго механизма не добавлено.
   */
  it('sends one and the same purchase identity when the same quote is submitted twice', async () => {
    purchaseSeatOverage.mockResolvedValue({
      outcome: 'seat_opened',
      invoice: {
        id: 'seat-invoice',
        amountMinor: 15_000,
        currency: 'RUB',
        expiresAt: '2026-08-19T12:00:00.000Z',
        providerCheckoutUrl: 'https://pay.example/seat',
      },
    });
    const quote = quoteFor(15_000);

    await Promise.all([
      POST(request({ purchase: 'seat_overage', quote })),
      POST(request({ purchase: 'seat_overage', quote })),
    ]);

    const purchaseKeys = () =>
      (purchaseSeatOverage.mock.calls as Array<[{ quote: { purchaseKey: string } }]>).map(
        (call) => call[0].quote.purchaseKey,
      );
    const keys = purchaseKeys();
    expect(keys).toHaveLength(2);
    expect(new Set(keys).size).toBe(1);

    // А отдельная покупка — отдельная котировка и отдельная личность покупки.
    await POST(request({ purchase: 'seat_overage', quote: quoteFor(15_000) }));
    expect(purchaseKeys()[2]).not.toBe(keys[0]);
  });

  it('rejects a direct seat purchase in read-only before the billing service', async () => {
    fakes.buildAppDeps.mockReturnValue({
      orgEntitlements: {
        resolveMechanicAccess: async () => ({ state: 'read_only', warning: null }),
      },
      saasBilling: { purchaseSeatOverage },
    });

    const response = await POST(request({ purchase: 'seat_overage', quote: quoteFor(15_000) }));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: 'commercial_read_only' });
    expect(purchaseSeatOverage).not.toHaveBeenCalled();
  });

  it('rejects a malformed typed purchase instead of falling through to tariff renewal', async () => {
    const response = await POST(request({ purchase: 'seat_overage', quote: '' }));

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

  it('returns the created invoice and checkout URL as authoritative readback', async () => {
    createOwnTariffRenewalInvoice.mockResolvedValue({
      id: 'renewal-invoice',
      providerCheckoutUrl: 'https://pay.example/renewal',
    });

    const response = await POST(new Request('http://test/api/clinic/billing', { method: 'POST' }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      invoiceId: 'renewal-invoice',
      checkoutUrl: 'https://pay.example/renewal',
    });
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

  // Решение владельца 18.08.2026: «Считать бесплатный тариф неоплачиваемым». Поломка, которую
  // ловит тест: отказ «платить нечего» приезжает как 503 «временно недоступно» — человеку сказано,
  // что система сломалась, и он будет жать кнопку снова.
  it('отказывает на бесплатном тарифе своей причиной, а не 503 «недоступно»', async () => {
    createOwnTariffRenewalInvoice.mockRejectedValue(new Error('saas_billing_tariff_not_payable'));

    const response = await POST(new Request('http://test/api/clinic/billing', { method: 'POST' }));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'saas_billing_tariff_not_payable',
    });
  });

  it('fails closed when the provider cannot carry fiscal receipt data', async () => {
    createOwnTariffRenewalInvoice.mockRejectedValue(
      new Error('payment_provider_receipt_unsupported:legacy-provider'),
    );

    const response = await POST(new Request('http://test/api/clinic/billing', { method: 'POST' }));

    expect(response.status).toBe(501);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'saas_billing_provider_capability_unsupported',
    });
  });
});
