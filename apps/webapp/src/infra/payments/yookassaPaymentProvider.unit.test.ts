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
