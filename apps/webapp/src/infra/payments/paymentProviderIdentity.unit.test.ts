import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAlfabankPaymentProvider } from './alfabankPaymentProvider';
import { createCloudpaymentsPaymentProvider } from './cloudpaymentsPaymentProvider';
import { createTinkoffPaymentProvider } from './tinkoffPaymentProvider';
import { createYookassaPaymentProvider } from './yookassaPaymentProvider';
import type { PaymentProviderPort } from '@/modules/payments/providerPort';
import type { PaymentProviderConfig } from '@/modules/payments/types';

type CapturedRequest = { url: string; body: Record<string, unknown> };

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

void (
  {
    amountMinor: 12_345,
    currency: 'RUB',
    idempotencyKey: 'b1-1-missing-payer',
    purpose: 'saas_billing_tariff_renewal',
    subjectRef: 'saas-invoice-b1-1',
    returnUrl: 'https://app.example.test/app/clinic/billing',
    invoice: { description: 'Ручной счёт SaaS', expiresAt: '2026-08-05T12:00:00.000Z' },
    metadata: {},
    // @ts-expect-error B1.1: a payment door without an identified payer must not compile.
  } satisfies Parameters<PaymentProviderPort['createIntent']>[0]
);

afterEach(() => vi.unstubAllGlobals());

describe('B1.1: identity reaches every provider request', () => {
  it('sends payer, purpose and subject to all four adapters, including a YooKassa invoice', async () => {
    const captured: CapturedRequest[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      const bodyText = String(init?.body ?? '');
      const body = bodyText.startsWith('{')
        ? (JSON.parse(bodyText) as Record<string, unknown>)
        : Object.fromEntries(new URLSearchParams(bodyText));
      captured.push({ url, body });
      if (url.includes('alfabank')) {
        return Response.json({ orderId: 'alfa-1', formUrl: 'https://pay.example.test/alfa' });
      }
      if (url.includes('cloudpayments')) {
        return Response.json({ Success: true, Model: { Id: 'cloud-1', Url: 'https://pay.example.test/cloud' } });
      }
      if (url.includes('tinkoff')) {
        return Response.json({ Success: true, PaymentId: 'tinkoff-1', PaymentURL: 'https://pay.example.test/tinkoff' });
      }
      if (url.endsWith('/invoices')) {
        return Response.json({ id: 'yookassa-invoice-1', delivery_method: { url: 'https://pay.example.test/invoice' } });
      }
      return Response.json({ id: 'yookassa-payment-1', confirmation: { confirmation_url: 'https://pay.example.test/yookassa' } });
    }));

    const adapters: Array<{ adapter: PaymentProviderPort; config: PaymentProviderConfig }> = [
      { adapter: createAlfabankPaymentProvider(), config: { id: 'alfabank', label: 'Alfa', enabled: true, merchantLogin: 'login', apiKey: 'secret' } },
      { adapter: createCloudpaymentsPaymentProvider(), config: { id: 'cloudpayments', label: 'Cloud', enabled: true, publicId: 'public', apiKey: 'secret' } },
      { adapter: createTinkoffPaymentProvider(), config: { id: 'tinkoff', label: 'Tinkoff', enabled: true, terminalKey: 'terminal', apiKey: 'secret' } },
      { adapter: createYookassaPaymentProvider(), config: { id: 'yookassa', label: 'YooKassa', enabled: true, shopId: 'shop', apiKey: 'secret' } },
    ];

    for (const { adapter, config } of adapters) {
      await adapter.createIntent({ ...paymentInput, providerConfig: config });
    }
    await createYookassaPaymentProvider().createIntent({
      ...paymentInput,
      invoice: { description: 'Ручной счёт SaaS', expiresAt: '2026-08-05T12:00:00.000Z' },
      providerConfig: adapters[3]!.config,
    });

    const alfaJson = JSON.parse(String(captured[0]!.body.jsonParams)) as Record<string, unknown>;
    const cloudJson = captured[1]!.body.JsonData as Record<string, unknown>;
    const tinkoffData = captured[2]!.body.DATA as Record<string, unknown>;
    const yookassaPayment = captured[3]!.body.metadata as Record<string, unknown>;
    const yookassaInvoice = (captured[4]!.body.payment_data as { metadata: Record<string, unknown> }).metadata;

    for (const fields of [alfaJson, cloudJson, tinkoffData, yookassaPayment, yookassaInvoice]) {
      expect(fields).toMatchObject({
        payerRef: paymentInput.payerRef,
        purpose: paymentInput.purpose,
        subjectRef: paymentInput.subjectRef,
      });
    }
    expect(captured[1]!.body.AccountId).toBe(paymentInput.payerRef);
    expect(captured[4]!.url).toBe('https://api.yookassa.ru/v3/invoices');
    expect((captured[4]!.body.payment_data as { confirmation?: unknown }).confirmation).toEqual({
      type: 'redirect',
      return_url: paymentInput.returnUrl,
    });
  });
});
