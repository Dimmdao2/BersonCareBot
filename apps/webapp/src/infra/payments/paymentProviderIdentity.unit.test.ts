import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAlfabankPaymentProvider } from './alfabankPaymentProvider';
import { createCloudpaymentsPaymentProvider } from './cloudpaymentsPaymentProvider';
import { createTinkoffPaymentProvider } from './tinkoffPaymentProvider';
import { createYookassaPaymentProvider } from './yookassaPaymentProvider';
import type { PaymentProviderPort } from '@/modules/payments/providerPort';
import type { PaymentProviderConfig } from '@/modules/payments/types';

type CapturedRequest = { url: string; body: Record<string, unknown>; headers: Headers };
type PaymentDoorInput = Parameters<PaymentProviderPort['createIntent']>[0];
type RequiredPaymentDoorFields =
  | 'amountMinor'
  | 'currency'
  | 'payerRef'
  | 'purpose'
  | 'subjectRef'
  | 'returnUrl';
type RequiredFieldsStayRequired = PaymentDoorInput extends Required<
  Pick<PaymentDoorInput, RequiredPaymentDoorFields>
>
  ? true
  : false;

const requiredFieldsStayRequired: RequiredFieldsStayRequired = true;
void requiredFieldsStayRequired;

const paymentInput = {
  amountMinor: 12_345,
  currency: 'RUB',
  idempotencyKey: 'b1-1-intent',
  payerRef: 'organization:org-b1-1',
  purpose: 'saas_billing_tariff_renewal',
  subjectRef: 'saas-invoice-b1-1',
  returnUrl: 'https://app.example.test/app/clinic/billing',
  metadata: { description: 'Тариф клиники' },
};

const providerConfigs = {
  alfabank: {
    id: 'alfabank',
    label: 'Alfa',
    enabled: true,
    merchantLogin: 'login',
    apiKey: 'secret',
  },
  cloudpayments: {
    id: 'cloudpayments',
    label: 'Cloud',
    enabled: true,
    publicId: 'public',
    apiKey: 'secret',
  },
  tinkoff: {
    id: 'tinkoff',
    label: 'Tinkoff',
    enabled: true,
    terminalKey: 'terminal',
    apiKey: 'secret',
  },
  yookassa: {
    id: 'yookassa',
    label: 'YooKassa',
    enabled: true,
    shopId: 'shop',
    apiKey: 'secret',
  },
} satisfies Record<string, PaymentProviderConfig>;

function captureProviderRequests() {
  const captured: CapturedRequest[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const bodyText = String(init?.body ?? '');
      const body = bodyText.startsWith('{')
        ? (JSON.parse(bodyText) as Record<string, unknown>)
        : Object.fromEntries(new URLSearchParams(bodyText));
      captured.push({ url, body, headers: new Headers(init?.headers) });
      if (url.includes('alfabank')) {
        return Response.json({ orderId: 'alfa-1', formUrl: 'https://pay.example.test/alfa' });
      }
      if (url.includes('cloudpayments')) {
        return Response.json({
          Success: true,
          Model: { Id: 'cloud-1', Url: 'https://pay.example.test/cloud' },
        });
      }
      if (url.includes('tinkoff')) {
        return Response.json({
          Success: true,
          PaymentId: 'tinkoff-1',
          PaymentURL: 'https://pay.example.test/tinkoff',
        });
      }
      if (url.endsWith('/invoices')) {
        return Response.json({
          id: 'yookassa-invoice-1',
          delivery_method: { url: 'https://pay.example.test/invoice' },
        });
      }
      return Response.json({
        id: 'yookassa-payment-1',
        confirmation: { confirmation_url: 'https://pay.example.test/yookassa' },
      });
    }),
  );
  return captured;
}

function expectIdentity(fields: Record<string, unknown>) {
  expect(fields).toMatchObject({
    payerRef: paymentInput.payerRef,
    purpose: paymentInput.purpose,
    subjectRef: paymentInput.subjectRef,
  });
}

afterEach(() => vi.unstubAllGlobals());

describe('B1.1: required payment-door values reach provider requests', () => {
  it('sends payer, subject, amount/currency and return URL to Alfa-Bank', async () => {
    const captured = captureProviderRequests();

    await createAlfabankPaymentProvider().createIntent({
      ...paymentInput,
      providerConfig: providerConfigs.alfabank,
    });

    const body = captured[0]!.body;
    expect(body).toMatchObject({
      amount: String(paymentInput.amountMinor),
      currency: '643',
      returnUrl: paymentInput.returnUrl,
    });
    expectIdentity(JSON.parse(String(body.jsonParams)) as Record<string, unknown>);
  });

  it('sends payer, subject, amount/currency and return URL to CloudPayments', async () => {
    const captured = captureProviderRequests();

    await createCloudpaymentsPaymentProvider().createIntent({
      ...paymentInput,
      providerConfig: providerConfigs.cloudpayments,
    });

    const body = captured[0]!.body;
    expect(body).toMatchObject({
      Amount: paymentInput.amountMinor / 100,
      Currency: paymentInput.currency,
      AccountId: paymentInput.payerRef,
      SuccessRedirectUrl: paymentInput.returnUrl,
    });
    expectIdentity(body.JsonData as Record<string, unknown>);
  });

  it('sends payer, subject, amount/currency and return URL to Tinkoff', async () => {
    const captured = captureProviderRequests();

    await createTinkoffPaymentProvider().createIntent({
      ...paymentInput,
      providerConfig: providerConfigs.tinkoff,
    });

    const body = captured[0]!.body;
    expect(body).toMatchObject({
      Amount: paymentInput.amountMinor,
      SuccessURL: paymentInput.returnUrl,
    });
    const data = body.DATA as Record<string, unknown>;
    expectIdentity(data);
    expect(data.currency).toBe(paymentInput.currency);
  });

  it('refuses a non-RUB Tinkoff amount before issuing an HTTP request', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    await expect(
      createTinkoffPaymentProvider().createIntent({
        ...paymentInput,
        currency: 'USD',
        providerConfig: providerConfigs.tinkoff,
      }),
    ).rejects.toThrow('tinkoff_currency_unsupported');

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('sends payer, subject, amount/currency and return URL to a YooKassa payment', async () => {
    const captured = captureProviderRequests();

    await createYookassaPaymentProvider().createIntent({
      ...paymentInput,
      providerConfig: providerConfigs.yookassa,
    });

    const body = captured[0]!.body;
    expect(body.amount).toEqual({ value: '123.45', currency: paymentInput.currency });
    expect(body.confirmation).toEqual({
      type: 'redirect',
      return_url: paymentInput.returnUrl,
    });
    expectIdentity(body.metadata as Record<string, unknown>);
  });

  it('sends the same required values inside the real YooKassa invoice payment payload', async () => {
    const captured = captureProviderRequests();

    await createYookassaPaymentProvider().createIntent({
      ...paymentInput,
      invoice: { description: 'Ручной счёт SaaS', expiresAt: '2026-08-05T12:00:00.000Z' },
      providerConfig: providerConfigs.yookassa,
    });

    const request = captured[0]!;
    const paymentData = request.body.payment_data as Record<string, unknown>;
    expect(request.url).toBe('https://api.yookassa.ru/v3/invoices');
    expect(paymentData.amount).toEqual({ value: '123.45', currency: paymentInput.currency });
    expect(paymentData.confirmation).toEqual({
      type: 'redirect',
      return_url: paymentInput.returnUrl,
    });
    expectIdentity(paymentData.metadata as Record<string, unknown>);
  });
});

describe('B0.3: YooKassa Idempotence-Key HTTP boundary', () => {
  const longIdempotencyKey =
    'renewal:organization-12345678:subscription-12345678:invoice-12345678:attempt-12345678';

  function expectedYookassaHeader(idempotencyKey: string): string {
    return createHash('sha256').update(idempotencyKey).digest('hex');
  }

  it('keeps a valid payment key byte-for-byte unchanged', async () => {
    const captured = captureProviderRequests();

    await createYookassaPaymentProvider().createIntent({
      ...paymentInput,
      providerConfig: providerConfigs.yookassa,
    });

    expect(captured[0]!.headers.get('Idempotence-Key')).toBe(paymentInput.idempotencyKey);
  });

  it('normalizes a long payment key deterministically without changing its body', async () => {
    const captured = captureProviderRequests();
    const provider = createYookassaPaymentProvider();
    const input = {
      ...paymentInput,
      idempotencyKey: longIdempotencyKey,
      providerConfig: providerConfigs.yookassa,
    };

    await provider.createIntent(input);
    await provider.createIntent(input);
    await provider.createIntent({ ...input, idempotencyKey: `${longIdempotencyKey}:changed` });

    const expectedHeader = expectedYookassaHeader(longIdempotencyKey);
    expect(expectedHeader).toHaveLength(64);
    expect(captured[0]!.headers.get('Idempotence-Key')).toBe(expectedHeader);
    expect(captured[1]!.headers.get('Idempotence-Key')).toBe(expectedHeader);
    expect(captured[0]!.body).toEqual(captured[1]!.body);
    expect(captured[2]!.headers.get('Idempotence-Key')).toBe(
      expectedYookassaHeader(`${longIdempotencyKey}:changed`),
    );
    expect(captured[2]!.headers.get('Idempotence-Key')).not.toBe(expectedHeader);
  });

  it('normalizes a long YooKassa invoice key only in its HTTP header', async () => {
    const captured = captureProviderRequests();

    await createYookassaPaymentProvider().createIntent({
      ...paymentInput,
      idempotencyKey: longIdempotencyKey,
      invoice: { description: 'Ручной счёт SaaS', expiresAt: '2026-08-05T12:00:00.000Z' },
      providerConfig: providerConfigs.yookassa,
    });

    expect(captured[0]!.headers.get('Idempotence-Key')).toBe(
      expectedYookassaHeader(longIdempotencyKey),
    );
    expect(captured[0]!.body.metadata).toMatchObject({ idempotencyKey: longIdempotencyKey });
  });

  it('normalizes a long YooKassa refund key only in its HTTP header', async () => {
    const captured = captureProviderRequests();

    await createYookassaPaymentProvider().refund({
      providerIntentRef: 'yookassa-payment-1',
      amountMinor: paymentInput.amountMinor,
      currency: paymentInput.currency,
      idempotencyKey: longIdempotencyKey,
      providerConfig: providerConfigs.yookassa,
    });

    expect(captured[0]!.headers.get('Idempotence-Key')).toBe(
      expectedYookassaHeader(longIdempotencyKey),
    );
  });
});
