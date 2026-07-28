import { createHmac } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { computeCloudPaymentsHmac } from '@/infra/payments/cloudpaymentsPaymentProvider';
import { computeTinkoffToken } from '@/infra/payments/tinkoffPaymentProvider';
import type { StoredPaymentProviderEvent } from './ports';
import { createPaymentsService } from './service';

const secret = 'synthetic-webhook-secret';

type ProviderCase = {
  providerId: string;
  bodyText: string;
  headers: Headers;
  persistedPayload: Record<string, unknown>;
  persistedRef: string;
};

function providerCases(): ProviderCase[] {
  const cloudBody = JSON.stringify({
    TransactionId: 'fresh-cloud-ref',
    InvoiceId: 'stable-event-key',
    Status: 'Completed',
  });
  const tinkoffPayload: Record<string, unknown> = {
    PaymentId: 'fresh-tinkoff-ref',
    OrderId: 'stable-event-key',
    Status: 'CONFIRMED',
    Amount: 100,
  };
  tinkoffPayload.Token = computeTinkoffToken(tinkoffPayload, secret);
  const tinkoffBody = JSON.stringify(tinkoffPayload);
  const alfaBody = JSON.stringify({
    mdOrder: 'fresh-alfa-ref',
    orderNumber: 'stable-event-key',
    orderStatus: 2,
  });
  const yooBody = JSON.stringify({
    event: 'payment.succeeded',
    object: {
      id: 'fresh-yoo-ref',
      status: 'succeeded',
      metadata: { idempotencyKey: 'stable-event-key' },
    },
  });

  return [
    {
      providerId: 'cloudpayments',
      bodyText: cloudBody,
      headers: new Headers({ 'content-hmac': computeCloudPaymentsHmac(cloudBody, secret) }),
      persistedPayload: { TransactionId: 4242 },
      persistedRef: '4242',
    },
    {
      providerId: 'tinkoff',
      bodyText: tinkoffBody,
      headers: new Headers(),
      persistedPayload: { PaymentId: 4343 },
      persistedRef: '4343',
    },
    {
      providerId: 'alfabank',
      bodyText: alfaBody,
      headers: new Headers({ 'content-type': 'application/json' }),
      persistedPayload: { mdOrder: 'persisted-provider-ref' },
      persistedRef: 'persisted-provider-ref',
    },
    {
      providerId: 'yookassa',
      bodyText: yooBody,
      headers: new Headers({
        'x-yookassa-signature': createHmac('sha256', secret).update(yooBody).digest('hex'),
      }),
      persistedPayload: { object: { id: 'persisted-provider-ref' } },
      persistedRef: 'persisted-provider-ref',
    },
  ];
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('provider event canonical replay', () => {
  it.each(providerCases())(
    '$providerId resumes an unprocessed duplicate from the persisted body, not the changed request',
    async ({ providerId, bodyText, headers, persistedPayload, persistedRef }) => {
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
      const intent = {
        id: `intent-${providerId}`,
        organizationId: 'org-1',
        idempotencyKey: 'intent-key',
        providerId,
        appointmentId: null,
        platformUserId: 'user-1',
        productRef: null,
        amountMinor: 100,
        currency: 'RUB',
        status: 'succeeded',
        purpose: 'appointment_prepayment',
        providerIntentRef: persistedRef,
      };
      const payment = {
        id: `payment-${providerId}`,
        organizationId: 'org-1',
        paymentIntentId: intent.id,
        appointmentId: null,
        amountMinor: 100,
        currency: 'RUB',
        status: 'captured',
        providerId,
        purpose: 'appointment_prepayment',
      };
      const stored: StoredPaymentProviderEvent = {
        inserted: false,
        id: `event-${providerId}`,
        organizationId: 'org-1',
        providerId,
        idempotencyKey: 'stable-event-key',
        eventType: 'payment.succeeded',
        intentRef: null,
        payloadJson: persistedPayload,
        processedAt: null,
      };
      const port = {
        recordProviderEvent: vi.fn().mockResolvedValue(stored),
        getProviderEventById: vi.fn().mockResolvedValue(stored),
        findIntentById: vi.fn(),
        findIntentByProviderRef: vi.fn(async (_organizationId: string, ref: string) =>
          ref === persistedRef ? intent : null,
        ),
        lockIntentForCapture: vi.fn().mockResolvedValue(intent),
        updateIntentStatus: vi.fn(),
        findPaymentByIntent: vi.fn().mockResolvedValue(payment),
        hasCapturedHistoryEvent: vi.fn().mockResolvedValue(true),
        appendHistoryEvent: vi.fn(),
        markProviderEventProcessed: vi.fn(),
      };
      const service = createPaymentsService({
        port: port as never,
        config: {
          getBookingPaymentSettings: async () => ({
            enabled: true,
            defaultProviderId: providerId,
            providers: [
              { id: providerId, label: providerId, enabled: true, webhookSecret: secret },
            ],
          }),
        },
        captureUnitOfWork: {
          run: async <T>(_organizationId: string, fn: () => Promise<T>) => fn(),
          runSerializedPostCommit: async <T>(
            _organizationId: string,
            _captureKey: string,
            fn: () => Promise<T>,
          ) => fn(),
        },
        bookingEngine: null,
      });

      await expect(
        service.processProviderWebhook({ organizationId: 'org-1', providerId, headers, bodyText }),
      ).resolves.toEqual({ ok: true, duplicate: true });

      expect(port.findIntentByProviderRef).toHaveBeenCalledWith('org-1', persistedRef);
      expect(port.findIntentByProviderRef).not.toHaveBeenCalledWith(
        'org-1',
        expect.stringContaining('fresh-'),
      );
      expect(port.markProviderEventProcessed).toHaveBeenCalledWith(stored.id, 'org-1');
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );
});
