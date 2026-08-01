import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSaasBillingService } from '@/modules/saas-billing/service';
import { createInMemorySaasBillingRepository } from '@/infra/repos/inMemorySaasBilling';
import { getPaymentProviderAdapter } from '@/infra/payments/paymentProviderRegistry';

const SHOP_ID = 'shop-9021';
const API_KEY = 'secret-key-9021';
const ALLOWED_IP = '77.75.156.11'; // published ЮKassa notification IP (single-host entry)
const DISALLOWED_IP = '203.0.113.7';
const ORGANIZATION_ID = '00000000-0000-4000-8000-000000009021';
const YOOKASSA_PAYMENT_ID = 'yk-payment-9021';

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
        defaultProviderId: 'yookassa',
        providers: [
          {
            id: 'yookassa',
            label: 'ЮKassa',
            enabled: true,
            webhookSecret: 'unused-webhook-secret-9021',
            shopId: SHOP_ID,
            apiKey: API_KEY,
          },
        ],
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

/**
 * The real ЮKassa payment object as returned by `GET /v3/payments/{id}` — the barrier that
 * `verifyWebhook` treats as the sole source of truth for status/amount/currency.
 */
let remotePaymentObject: { status: string; amount: { value: string; currency: string } } = {
  status: 'succeeded',
  amount: { value: '0.00', currency: 'RUB' },
};

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

function installYookassaFetchStub() {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    if (url === 'https://api.yookassa.ru/v3/payments' && method === 'POST') {
      return jsonResponse({
        id: YOOKASSA_PAYMENT_ID,
        confirmation: { confirmation_url: 'https://yookassa.ru/checkout/9021' },
      });
    }
    const getMatch = /^https:\/\/api\.yookassa\.ru\/v3\/payments\/([^/]+)$/.exec(url);
    if (getMatch && method === 'GET') {
      return jsonResponse({
        id: getMatch[1],
        status: remotePaymentObject.status,
        amount: remotePaymentObject.amount,
        metadata: {},
      });
    }
    throw new Error(`unexpected fetch call in test: ${method} ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/** The notification body — a forged/replayed one carries whatever an attacker or a stale retry wants. */
function yookassaWebhookBody(paymentId: string): string {
  return JSON.stringify({
    event: 'payment.succeeded',
    object: {
      id: paymentId,
      status: 'succeeded',
      amount: { value: '0.00', currency: 'RUB' },
      metadata: {},
    },
  });
}

function webhookRequest(bodyText: string, realIp: string = ALLOWED_IP): Request {
  const headers = new Headers({ 'content-type': 'application/json', 'x-real-ip': realIp });
  return new Request('https://app.example.test/api/payments/saas-webhook/yookassa', {
    method: 'POST',
    headers,
    body: bodyText,
  });
}

function invoke(request: Request) {
  return receiveSaasWebhook(request, { params: Promise.resolve({ provider: 'yookassa' }) });
}

async function invoiceStatus(service: ReturnType<typeof buildService>) {
  const overview = await service.getOrganizationBillingOverview(ORGANIZATION_ID);
  return overview.invoices[0]?.status;
}

describe('POST /api/payments/saas-webhook/[provider]', () => {
  let service: ReturnType<typeof buildService>;
  let fetchMock: ReturnType<typeof installYookassaFetchStub>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    remotePaymentObject = { status: 'succeeded', amount: { value: '0.00', currency: 'RUB' } };
    fetchMock = installYookassaFetchStub();
    service = buildService();
    fakes.buildAppDeps.mockReturnValue({ saasBilling: service });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('captures the clinic tariff payment on a valid succeeded event', async () => {
    const invoice = await seedPendingInvoice(service);
    const body = yookassaWebhookBody(invoice.providerInvoiceRef ?? '');

    const response = await invoke(webhookRequest(body));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, captured: true, duplicate: false });
    await expect(invoiceStatus(service)).resolves.toBe('paid');
  });

  // Отказ 1/5: уведомление не с опубликованного IP ЮKassa не проводит оплату.
  it('rejects a notification from an IP outside the published allowlist and captures nothing', async () => {
    const invoice = await seedPendingInvoice(service);
    fetchMock.mockClear();
    const body = yookassaWebhookBody(invoice.providerInvoiceRef ?? '');

    const response = await invoke(webhookRequest(body, DISALLOWED_IP));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'invalid_webhook_signature',
    });
    expect(fetchMock).not.toHaveBeenCalled();
    await expect(invoiceStatus(service)).resolves.toBe('pending');
  });

  // Отказ 2/5: тело, расходящееся с ответом API, не проводит оплату — только API решает, что случилось.
  it('does not capture when the notification body diverges from the API payment object', async () => {
    const invoice = await seedPendingInvoice(service);
    // Body claims success; the real payment (per the API) is still awaiting capture.
    remotePaymentObject = { status: 'waiting_for_capture', amount: { value: '0.00', currency: 'RUB' } };
    const body = yookassaWebhookBody(invoice.providerInvoiceRef ?? '');

    const response = await invoke(webhookRequest(body));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      captured: false,
      duplicate: false,
    });
    await expect(invoiceStatus(service)).resolves.toBe('pending');
  });

  // Отказ 3/5: несовпадение суммы (по данным API) не меняет доступ.
  it('acknowledges an amount mismatch without capturing', async () => {
    const invoice = await seedPendingInvoice(service);
    remotePaymentObject = { status: 'succeeded', amount: { value: '9999.99', currency: 'RUB' } };
    const body = yookassaWebhookBody(invoice.providerInvoiceRef ?? '');

    const response = await invoke(webhookRequest(body));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      acknowledged: true,
      reason: 'amount_mismatch',
    });
    await expect(invoiceStatus(service)).resolves.toBe('pending');
  });

  // Отказ 4/5: несовпадение валюты (по данным API) не меняет доступ.
  it('acknowledges a currency mismatch without capturing', async () => {
    const invoice = await seedPendingInvoice(service);
    remotePaymentObject = { status: 'succeeded', amount: { value: '0.00', currency: 'USD' } };
    const body = yookassaWebhookBody(invoice.providerInvoiceRef ?? '');

    const response = await invoke(webhookRequest(body));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      acknowledged: true,
      reason: 'currency_mismatch',
    });
    await expect(invoiceStatus(service)).resolves.toBe('pending');
  });

  // Отказ 5/5: повтор события не удваивает оплату и не меняет доступ повторно.
  it('does not double-process a replayed event', async () => {
    const invoice = await seedPendingInvoice(service);
    const body = yookassaWebhookBody(invoice.providerInvoiceRef ?? '');

    const first = await invoke(webhookRequest(body));
    expect(first.status).toBe(200);
    await expect(first.json()).resolves.toEqual({ ok: true, captured: true, duplicate: false });
    await expect(invoiceStatus(service)).resolves.toBe('paid');

    const second = await invoke(webhookRequest(body));
    expect(second.status).toBe(200);
    await expect(second.json()).resolves.toEqual({ ok: true, captured: false, duplicate: true });
    await expect(invoiceStatus(service)).resolves.toBe('paid');
  });

  it('safe-acknowledges an unknown provider reference without lookup side effects', async () => {
    await seedPendingInvoice(service);
    const body = yookassaWebhookBody('yk-payment-does-not-exist');

    const response = await invoke(webhookRequest(body));

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
    const body = yookassaWebhookBody(invoice.providerInvoiceRef ?? '');

    const response = await invoke(webhookRequest(body));

    expect(response.status).toBe(200);
    await expect(invoiceStatus(service)).resolves.toBe('paid');
  });
});
