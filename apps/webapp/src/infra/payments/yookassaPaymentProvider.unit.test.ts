import { afterEach, describe, expect, it, vi } from 'vitest';
import { PaymentProviderRequestRefusedError } from '@/modules/payments/providerPort';
import type { PaymentProviderConfig } from '@/modules/payments/types';
import { createYookassaPaymentProvider } from './yookassaPaymentProvider';

const providerConfig: PaymentProviderConfig = {
  id: 'yookassa',
  label: 'ЮKassa',
  enabled: true,
  shopId: 'test-shop',
  apiKey: 'test-key',
};

const createIntentParams = {
  amountMinor: 10_000,
  currency: 'RUB',
  idempotencyKey: 'test-idempotency-key',
  payerRef: 'organization:org-1',
  purpose: 'saas_billing_tariff_renewal',
  subjectRef: 'invoice-1',
  returnUrl: 'https://app.example.test/settings',
  metadata: {},
  providerConfig,
} as const;

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

// B0.3/#1057 — ЮKassa answers a 4xx BEFORE any payment object is created (bad params, a reused
// Idempotence-Key, auth, rate limit): the caller must be told nothing was created so it is safe to
// retry under a fresh idempotency key. A 5xx (or a network/timeout failure) is ambiguous — the
// request may have reached processing before failing — and must surface as a plain `Error` so the
// caller keeps retrying under the SAME key instead of risking a double charge.
describe('yookassa createIntent — refused vs ambiguous failure classification', () => {
  it('a real invoice HTTP 403 is typed at the adapter boundary', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(403, { type: 'error', code: 'forbidden' })),
    );
    const provider = createYookassaPaymentProvider();

    await expect(
      provider.createIntent({
        ...createIntentParams,
        invoice: {
          description: 'Manual SaaS invoice',
          expiresAt: '2026-08-20T00:00:00.000Z',
        },
      }),
    ).rejects.toBeInstanceOf(PaymentProviderRequestRefusedError);
  });

  it('an invoice HTTP 500 remains ambiguous and untyped', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(500, { type: 'error', code: 'internal_server_error' })),
    );
    const provider = createYookassaPaymentProvider();

    const rejection = provider.createIntent({
      ...createIntentParams,
      invoice: {
        description: 'Manual SaaS invoice',
        expiresAt: '2026-08-20T00:00:00.000Z',
      },
    });
    await expect(rejection).rejects.toThrow('yookassa_create_invoice_failed:500');
    await expect(rejection).rejects.not.toBeInstanceOf(PaymentProviderRequestRefusedError);
  });

  it('a 400 response (e.g. a reused Idempotence-Key) throws PaymentProviderRequestRefusedError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse(400, {
          type: 'error',
          code: 'invalid_request',
          description: "You've already used this idempotence key",
        }),
      ),
    );
    const provider = createYookassaPaymentProvider();

    await expect(provider.createIntent(createIntentParams)).rejects.toBeInstanceOf(
      PaymentProviderRequestRefusedError,
    );
  });

  it('a 429 response also throws PaymentProviderRequestRefusedError — refused before processing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(429, { type: 'error', code: 'too_many_requests' })));
    const provider = createYookassaPaymentProvider();

    await expect(provider.createIntent(createIntentParams)).rejects.toBeInstanceOf(
      PaymentProviderRequestRefusedError,
    );
  });

  it('a 500 response throws a plain Error, NOT PaymentProviderRequestRefusedError — ambiguous', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(500, { type: 'error', code: 'internal_server_error' })),
    );
    const provider = createYookassaPaymentProvider();

    const rejection = provider.createIntent(createIntentParams);
    await expect(rejection).rejects.toThrow('yookassa_create_failed:500');
    await expect(rejection).rejects.not.toBeInstanceOf(PaymentProviderRequestRefusedError);
  });

  it('a successful 2xx response is unaffected by the classification', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse(200, {
          id: 'payment-1',
          status: 'pending',
          confirmation: { confirmation_url: 'https://yookassa.example.test/pay' },
        }),
      ),
    );
    const provider = createYookassaPaymentProvider();

    await expect(provider.createIntent(createIntentParams)).resolves.toMatchObject({
      providerIntentRef: 'payment-1',
      checkoutUrl: 'https://yookassa.example.test/pay',
    });
  });
});

// Этап 1 (1.1/1.2) — the reconciliation sweep compares this list against our journal. Two things
// make it either a check or a false-alarm generator: it must ask for arrived money only, and it
// must name each payment by the SAME ref `verifyWebhook` derives and the journal stored.
describe('yookassa listPayments — what the reconciliation actually gets', () => {
  it('asks the provider for succeeded payments only', async () => {
    const fetchMock = vi.fn(async (url: string | URL) =>
      jsonResponse(200, { type: 'list', items: [], _url: String(url) }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const provider = createYookassaPaymentProvider();

    await provider.listPayments!({
      periodFromIso: '2026-08-01T00:00:00.000Z',
      periodToIso: '2026-08-18T23:59:59.999Z',
      providerConfig,
    });

    const requestedUrl = new URL(String(fetchMock.mock.calls[0]![0]));
    expect(requestedUrl.searchParams.get('status')).toBe('succeeded');
  });

  it('names an invoice-paid payment by the invoice id the journal stored, not the payment id', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse(200, {
          type: 'list',
          items: [
            {
              id: 'payment-2f0',
              status: 'succeeded',
              amount: { value: '4900.00', currency: 'RUB' },
              invoice_details: { id: 'in-9021' },
              metadata: { saasBillingInvoiceId: 'invoice-1', organizationId: 'org-1' },
              refunded_amount: { value: '100.00', currency: 'RUB' },
            },
          ],
        }),
      ),
    );
    const provider = createYookassaPaymentProvider();

    await expect(
      provider.listPayments!({
        periodFromIso: '2026-08-01T00:00:00.000Z',
        periodToIso: '2026-08-18T23:59:59.999Z',
        providerConfig,
      }),
    ).resolves.toEqual({
      truncated: false,
      items: [
        {
          providerPaymentRef: 'in-9021',
          status: 'succeeded',
          amountMinor: 490_000,
          currency: 'RUB',
          metadata: { saasBillingInvoiceId: 'invoice-1', organizationId: 'org-1' },
          refundedAmountMinor: 10_000,
        },
      ],
    });
  });

  it('a direct payment (no invoice) keeps its own id and reports no refunds as 0', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse(200, {
          type: 'list',
          items: [
            { id: 'payment-77', status: 'succeeded', amount: { value: '1500.00', currency: 'RUB' } },
          ],
        }),
      ),
    );
    const provider = createYookassaPaymentProvider();

    const result = await provider.listPayments!({
      periodFromIso: '2026-08-01T00:00:00.000Z',
      periodToIso: '2026-08-18T23:59:59.999Z',
      providerConfig,
    });

    expect(result.items).toEqual([
      {
        providerPaymentRef: 'payment-77',
        status: 'succeeded',
        amountMinor: 150_000,
        currency: 'RUB',
        metadata: undefined,
        refundedAmountMinor: 0,
      },
    ]);
  });
});
