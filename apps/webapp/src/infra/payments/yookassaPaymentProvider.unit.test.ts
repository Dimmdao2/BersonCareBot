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

/**
 * Independent oracle: YooKassa's invoice flow says to GET the invoice first and, once
 * `payment_details.id` appears, GET that payment object. The id returned by `POST /v3/invoices`
 * is not a payment id:
 * https://yookassa.ru/developers/payment-acceptance/scenario-extensions/invoices/payments
 *
 * Expensive silent failure: every appointment prepayment with a deadline stores an invoice id;
 * treating it as a payment id makes the point-reconciliation lane exhaust without observing money.
 */
describe('yookassa appointment invoice point reconciliation', () => {
  it('re-reads the provider ref returned at invoice creation after its linked payment succeeds', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === 'https://api.yookassa.ru/v3/invoices' && init?.method === 'POST') {
        return jsonResponse(200, {
          id: 'in-appointment-1',
          delivery_method: { url: 'https://yookassa.example.test/invoice' },
        });
      }
      if (url === 'https://api.yookassa.ru/v3/invoices/in-appointment-1') {
        return jsonResponse(200, {
          id: 'in-appointment-1',
          status: 'succeeded',
          payment_details: { id: 'payment-appointment-1', status: 'succeeded' },
        });
      }
      if (url === 'https://api.yookassa.ru/v3/payments/payment-appointment-1') {
        return jsonResponse(200, {
          id: 'payment-appointment-1',
          status: 'succeeded',
          amount: { value: '100.00', currency: 'RUB' },
          invoice_details: { id: 'in-appointment-1' },
          metadata: {
            idempotencyKey: 'appointment-payment-1',
            payerRef: 'platform_user:user-1',
            purpose: 'appointment_prepayment',
            subjectRef: 'appointment-1',
          },
        });
      }
      return jsonResponse(404, { type: 'error', code: 'not_found' });
    });
    vi.stubGlobal('fetch', fetchMock);
    const provider = createYookassaPaymentProvider();

    const created = await provider.createIntent({
      ...createIntentParams,
      idempotencyKey: 'appointment-payment-1',
      payerRef: 'platform_user:user-1',
      purpose: 'appointment_prepayment',
      subjectRef: 'appointment-1',
      invoice: {
        description: 'Appointment prepayment',
        expiresAt: '2026-09-20T00:00:00.000Z',
      },
    });

    await expect(
      provider.getPaymentStatus!({
        providerObjectRef: created.providerIntentRef,
        providerConfig,
      }),
    ).resolves.toMatchObject({
      providerObjectRef: 'payment-appointment-1',
      providerPaymentRef: 'in-appointment-1',
      idempotencyKey: 'appointment-payment-1',
      eventType: 'payment.succeeded',
      amountMinor: 10_000,
      currency: 'RUB',
    });
  });
});

/**
 * Independent oracle: YooKassa requires a payment id in `payment_id`; an invoice id must first be
 * resolved through the invoice's `payment_details.id`:
 * https://yookassa.ru/developers/payment-acceptance/scenario-extensions/invoices/refunds
 *
 * Expensive silent failure: an appointment cancellation is already committed when its automatic
 * refund runs. Sending the stored invoice id as `payment_id` leaves that cancelled appointment's
 * money with the clinic unless somebody notices and retries it by hand.
 */
describe('yookassa appointment invoice refund', () => {
  it('refunds the payment linked to an invoice rather than using the invoice id as payment_id', async () => {
    let refundBody: Record<string, unknown> | null = null;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === 'https://api.yookassa.ru/v3/invoices/in-appointment-1') {
        return jsonResponse(200, {
          id: 'in-appointment-1',
          status: 'succeeded',
          payment_details: { id: 'payment-appointment-1', status: 'succeeded' },
        });
      }
      if (url === 'https://api.yookassa.ru/v3/refunds' && init?.method === 'POST') {
        refundBody = JSON.parse(String(init.body)) as Record<string, unknown>;
        return jsonResponse(200, { id: 'refund-1', status: 'succeeded' });
      }
      return jsonResponse(404, { type: 'error', code: 'not_found' });
    });
    vi.stubGlobal('fetch', fetchMock);

    await createYookassaPaymentProvider().refund({
      providerIntentRef: 'in-appointment-1',
      amountMinor: 3_000,
      currency: 'RUB',
      idempotencyKey: 'appointment-refund-1',
      providerConfig,
    });

    expect(refundBody).toMatchObject({ payment_id: 'payment-appointment-1' });
  });
});

/**
 * Independent oracle: YooKassa's response-handling protocol says HTTP 200 + `pending` is unknown
 * and HTTP 200 + `canceled` is unsuccessful; only `succeeded` proves the refund happened:
 * https://yookassa.ru/developers/using-api/response-handling/recommendations
 *
 * Expensive silent failure: accepting either response makes the local immutable refund journal say
 * money was returned although the provider has not returned it.
 */
describe('yookassa refund terminal status', () => {
  it.each(['pending', 'canceled'] as const)('does not report a %s refund as successful', async (status) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(200, { id: `refund-${status}`, status })),
    );

    await expect(
      createYookassaPaymentProvider().refund({
        providerIntentRef: 'payment-1',
        amountMinor: 3_000,
        currency: 'RUB',
        idempotencyKey: `appointment-refund-${status}`,
        providerConfig,
      }),
    ).rejects.toThrow();
  });
});

/**
 * Independent oracle: YooKassa publishes its notification source networks and instructs the
 * merchant to authenticate a notification by requesting the current object from the API:
 * https://yookassa.ru/developers/using-api/webhooks
 *
 * Expensive silent failure: trusting an arbitrary POST, or its amount/status, can create an
 * immutable captured-payment fact without money reaching the clinic.
 */
describe('yookassa webhook authenticity', () => {
  const notification = JSON.stringify({
    event: 'payment.succeeded',
    object: {
      id: 'payment-webhook-1',
      status: 'succeeded',
      amount: { value: '100.00', currency: 'RUB' },
      metadata: { idempotencyKey: 'appointment-payment-1' },
    },
  });

  it('rejects a forged notification before trusting its body', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      createYookassaPaymentProvider().verifyWebhook({
        headers: new Headers({ 'x-real-ip': '203.0.113.10' }),
        bodyText: notification,
        webhookSecret: '',
        providerConfig,
      }),
    ).rejects.toThrow('invalid_webhook_signature');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uses refetched provider status and amount instead of the notification body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse(200, {
          id: 'payment-webhook-1',
          status: 'canceled',
          amount: { value: '25.00', currency: 'RUB' },
          metadata: { idempotencyKey: 'appointment-payment-1' },
        }),
      ),
    );

    await expect(
      createYookassaPaymentProvider().verifyWebhook({
        headers: new Headers({ 'x-real-ip': '185.71.76.1' }),
        bodyText: notification,
        webhookSecret: '',
        providerConfig,
      }),
    ).resolves.toMatchObject({
      eventType: 'payment.canceled',
      amountMinor: 2_500,
    });
  });
});
