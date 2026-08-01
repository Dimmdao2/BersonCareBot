import { createHmac } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSaasBillingService } from '@/modules/saas-billing/service';
import { createInMemorySaasBillingRepository } from '@/infra/repos/inMemorySaasBilling';
import { getPaymentProviderAdapter } from '@/infra/payments/paymentProviderRegistry';

const WEBHOOK_SECRET = 'saas-webhook-secret-9021';
const ORGANIZATION_ID = '00000000-0000-4000-8000-000000009021';

vi.mock('@/app-layer/principal/bootstrapPrincipal', () => ({
  stampBootstrapPrincipal: vi.fn(),
}));
vi.mock('@bersoncare/db-principal', () => ({
  runWithDbOrganizationPrincipal: <T>(_organizationId: string, callback: () => T): T =>
    callback(),
}));

function buildService() {
  return createSaasBillingService({
    repository: createInMemorySaasBillingRepository(),
    settings: {
      getSaasBillingPaymentProviderValue: async () => ({
        defaultProviderId: 'mock',
        providers: [{ id: 'mock', label: 'Mock', enabled: true, webhookSecret: WEBHOOK_SECRET }],
      }),
    },
    resolvePaymentProvider: getPaymentProviderAdapter,
  });
}

const fakes = vi.hoisted(() => ({ buildAppDeps: vi.fn() }));
vi.mock('@/app-layer/di/buildAppDeps', () => ({ buildAppDeps: fakes.buildAppDeps }));

import { POST as receiveSaasWebhook } from '@/app/api/payments/saas-webhook/[provider]/route';

async function seedPendingInvoice(service: ReturnType<typeof buildService>) {
  await service.assignManualTariff({
    organizationId: ORGANIZATION_ID,
    tariffId: 'tariff-9021',
    audit: { actorId: 'operator-9021', reason: 'test seed' },
  });
  const overview = await service.getOrganizationBillingOverview(ORGANIZATION_ID);
  const subscriptionId = overview.subscriptions[0]?.id;
  if (!subscriptionId) throw new Error('test_setup_failed: no subscription seeded');

  const invoice = await service.createRenewalSaasBillingInvoice({
    organizationId: ORGANIZATION_ID,
    saasBillingSubscriptionId: subscriptionId,
    servicePeriodStartsAt: '2026-08-01T00:00:00.000Z',
    servicePeriodEndsAt: '2026-09-01T00:00:00.000Z',
    providerIdempotencyKey: 'renewal-9021',
  });
  // In-memory invoices are always amountMinor=0 / currency=RUB (infra/repos/inMemorySaasBilling.ts).
  return invoice;
}

function sign(bodyText: string): string {
  return createHmac('sha256', WEBHOOK_SECRET).update(bodyText).digest('hex');
}

function webhookRequest(bodyText: string, signature?: string): Request {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (signature !== undefined) headers.set('x-mock-signature', signature);
  return new Request('https://app.example.test/api/payments/saas-webhook/mock', {
    method: 'POST',
    headers,
    body: bodyText,
  });
}

function invoke(request: Request) {
  return receiveSaasWebhook(request, { params: Promise.resolve({ provider: 'mock' }) });
}

async function invoiceStatus(service: ReturnType<typeof buildService>) {
  const overview = await service.getOrganizationBillingOverview(ORGANIZATION_ID);
  return overview.invoices[0]?.status;
}

describe('POST /api/payments/saas-webhook/[provider]', () => {
  let service: ReturnType<typeof buildService>;

  beforeEach(async () => {
    vi.clearAllMocks();
    service = buildService();
    fakes.buildAppDeps.mockReturnValue({ saasBilling: service });
  });

  it('captures the clinic tariff payment on a valid succeeded event', async () => {
    const invoice = await seedPendingInvoice(service);
    const body = JSON.stringify({
      idempotencyKey: 'event-9021-a',
      eventType: 'payment.succeeded',
      intentRef: invoice.providerInvoiceRef,
      amountMinor: 0,
      currency: 'RUB',
    });

    const response = await invoke(webhookRequest(body, sign(body)));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, captured: true, duplicate: false });
    await expect(invoiceStatus(service)).resolves.toBe('paid');
  });

  // Отказ 1/4: подделанная подпись не меняет доступ.
  it('rejects a forged signature and captures nothing', async () => {
    await seedPendingInvoice(service);
    const body = JSON.stringify({
      idempotencyKey: 'event-9021-forged',
      eventType: 'payment.succeeded',
      intentRef: 'mock_intent_renewal-9021',
      amountMinor: 0,
      currency: 'RUB',
    });

    const response = await invoke(webhookRequest(body, 'not-a-valid-signature'));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'invalid_webhook_signature',
    });
    await expect(invoiceStatus(service)).resolves.toBe('pending');
  });

  // Отказ 2/4: несовпадение суммы не меняет доступ.
  it('acknowledges an amount mismatch without capturing', async () => {
    await seedPendingInvoice(service);
    const body = JSON.stringify({
      idempotencyKey: 'event-9021-amount',
      eventType: 'payment.succeeded',
      intentRef: 'mock_intent_renewal-9021',
      amountMinor: 999_999,
      currency: 'RUB',
    });

    const response = await invoke(webhookRequest(body, sign(body)));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      acknowledged: true,
      reason: 'amount_mismatch',
    });
    await expect(invoiceStatus(service)).resolves.toBe('pending');
  });

  // Отказ 3/4: несовпадение валюты не меняет доступ.
  it('acknowledges a currency mismatch without capturing', async () => {
    await seedPendingInvoice(service);
    const body = JSON.stringify({
      idempotencyKey: 'event-9021-currency',
      eventType: 'payment.succeeded',
      intentRef: 'mock_intent_renewal-9021',
      amountMinor: 0,
      currency: 'USD',
    });

    const response = await invoke(webhookRequest(body, sign(body)));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      acknowledged: true,
      reason: 'currency_mismatch',
    });
    await expect(invoiceStatus(service)).resolves.toBe('pending');
  });

  // Отказ 4/4: повтор события не удваивает оплату и не меняет доступ повторно.
  it('does not double-process a replayed event', async () => {
    const invoice = await seedPendingInvoice(service);
    const body = JSON.stringify({
      idempotencyKey: 'event-9021-replay',
      eventType: 'payment.succeeded',
      intentRef: invoice.providerInvoiceRef,
      amountMinor: 0,
      currency: 'RUB',
    });

    const first = await invoke(webhookRequest(body, sign(body)));
    expect(first.status).toBe(200);
    await expect(first.json()).resolves.toEqual({ ok: true, captured: true, duplicate: false });
    await expect(invoiceStatus(service)).resolves.toBe('paid');

    const second = await invoke(webhookRequest(body, sign(body)));
    expect(second.status).toBe(200);
    await expect(second.json()).resolves.toEqual({ ok: true, captured: false, duplicate: true });
    await expect(invoiceStatus(service)).resolves.toBe('paid');
  });

  it('safe-acknowledges an unknown provider reference without lookup side effects', async () => {
    await seedPendingInvoice(service);
    const body = JSON.stringify({
      idempotencyKey: 'event-9021-unknown',
      eventType: 'payment.succeeded',
      intentRef: 'mock_intent_does-not-exist',
      amountMinor: 0,
      currency: 'RUB',
    });

    const response = await invoke(webhookRequest(body, sign(body)));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      acknowledged: true,
      reason: 'unknown_reference',
    });
    await expect(invoiceStatus(service)).resolves.toBe('pending');
  });

  // Инвариант (§5a/2.1c): оплата тарифа не гейтится коммерческим состоянием клиники. Структурное
  // доказательство — `modules/saas-billing/service.test.ts` парсит этот роут и роняет сборку, если
  // он когда-либо импортирует org-entitlements/requireEntitlement/cabinetAccessGate. Этот тест — его
  // поведенческая половина: захват идёт до конца, ни разу не обратившись к commercial/lifecycle state
  // организации (в цепочке вызовов такого чтения нет в принципе).
  it('captures payment purely from provider+invoice identity, never touching commercial state', async () => {
    const invoice = await seedPendingInvoice(service);
    const body = JSON.stringify({
      idempotencyKey: 'event-9021-blocked-org',
      eventType: 'payment.succeeded',
      intentRef: invoice.providerInvoiceRef,
      amountMinor: 0,
      currency: 'RUB',
    });

    const response = await invoke(webhookRequest(body, sign(body)));

    expect(response.status).toBe(200);
    await expect(invoiceStatus(service)).resolves.toBe('paid');
  });
});
