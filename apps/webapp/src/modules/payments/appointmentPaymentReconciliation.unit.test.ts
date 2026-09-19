/**
 * Independent oracle: PAY-REL-04 requires every appointment-looking provider item to be resolved
 * before the durable checkpoint advances. The provider fact below names an appointment subject
 * but has lost its purpose binding.
 *
 * Expensive silent failure: advancing the checkpoint skips received money permanently once the
 * overlap window moves past the payment's creation time.
 */
import { describe, expect, it, vi } from 'vitest';
import { createPaymentsService } from './service';
import type { PaymentsPort } from './ports';
import type { BookingPaymentSettings } from './types';

const providerAdapter = vi.hoisted(() => ({
  getPaymentStatus: vi.fn(),
  listPaymentStatuses: vi.fn(),
}));

vi.mock('@/infra/payments/paymentProviderRegistry', () => ({
  getPaymentProviderAdapter: vi.fn(() => providerAdapter),
}));

const ORGANIZATION_ID = '18f00cc5-c393-4d4b-8aad-cf199a1c60e2';
const APPOINTMENT_ID = 'ed75f46c-cea9-4af4-b21c-f358215798f5';

const settings: BookingPaymentSettings = {
  enabled: true,
  defaultProviderId: 'yookassa',
  fiscalVatCode: '1',
  providers: [
    {
      id: 'yookassa',
      label: 'YooKassa',
      enabled: true,
      shopId: 'shop-1',
      apiKey: 'key-1',
    },
  ],
};

describe('PAY-REL-04 appointment provider sweep checkpoint', () => {
  it('does not advance past an appointment-looking item whose binding is unresolved', async () => {
    providerAdapter.listPaymentStatuses.mockResolvedValue({
      truncated: false,
      items: [
        {
          providerObjectRef: 'payment-1',
          providerPaymentRef: 'invoice-1',
          idempotencyKey: 'appointment-payment-1',
          eventType: 'payment.succeeded',
          status: 'succeeded',
          amountMinor: 10_000,
          currency: 'RUB',
          payload: {
            event: 'payment.succeeded',
            object: {
              id: 'payment-1',
              status: 'succeeded',
              invoice_details: { id: 'invoice-1' },
              metadata: {
                appointmentId: APPOINTMENT_ID,
                idempotencyKey: 'appointment-payment-1',
                payerRef: 'platform_user:user-1',
                subjectRef: APPOINTMENT_ID,
              },
            },
          },
        },
      ],
    });
    const advanceAppointmentPaymentReconciliationWatermark = vi.fn(async () => undefined);
    const service = createPaymentsService({
      port: {
        readAppointmentPaymentReconciliationSweep: vi.fn(async () => ({
          providerId: 'yookassa',
          watermark: '2026-09-19T08:00:00.000Z',
          oldestUnresolvedCreatedAt: null,
        })),
        readAppointmentPaymentReconciliationIntentByProviderRef: vi.fn(async () => null),
        advanceAppointmentPaymentReconciliationWatermark,
      } as unknown as PaymentsPort,
      config: { getBookingPaymentSettings: async () => settings },
      captureUnitOfWork: {
        run: async (_organizationId, fn) => fn(),
        runSerializedPostCommit: async (_organizationId, _key, fn) => fn(),
      },
      bookingEngine: null,
    });

    await service
      .reconcileAppointmentPaymentSweep({
        organizationId: ORGANIZATION_ID,
        providerId: 'yookassa',
      })
      .catch(() => undefined);

    expect(advanceAppointmentPaymentReconciliationWatermark).not.toHaveBeenCalled();
  });
});

/**
 * Independent oracle: PAY-REL-04 says a reconciliation success must use the webhook-compatible
 * event key and the same atomic settlement/outbox root. That DB-root call is the observable money
 * side effect at this cheapest layer.
 *
 * Expensive silent failure: a reconciliation-specific key or a second write path lets the later
 * webhook create duplicate money/history/outbox/Notification facts.
 */
describe('PAY-REL-04 point reconciliation settlement identity', () => {
  it('hands provider success to the canonical root with the webhook-compatible identity', async () => {
    const providerFact = {
      providerObjectRef: 'payment-1',
      providerPaymentRef: 'invoice-1',
      idempotencyKey: 'appointment-payment-1',
      eventType: 'payment.succeeded',
      status: 'succeeded',
      amountMinor: 10_000,
      currency: 'RUB',
      payload: {
        event: 'payment.succeeded',
        object: {
          id: 'payment-1',
          status: 'succeeded',
          invoice_details: { id: 'invoice-1' },
          metadata: {
            idempotencyKey: 'appointment-payment-1',
            payerRef: 'platform_user:user-1',
            purpose: 'appointment_prepayment',
            subjectRef: APPOINTMENT_ID,
          },
        },
      },
    };
    providerAdapter.getPaymentStatus.mockResolvedValue(providerFact);
    const settleProviderWebhookEvent = vi.fn(async () => ({
      outcome: 'captured' as const,
      duplicate: false,
      paymentId: 'payment-local-1',
      platformUserId: 'user-1',
      productRef: null,
      confirmedAppointmentIds: [APPOINTMENT_ID],
    }));
    const service = createPaymentsService({
      port: {
        readAppointmentPaymentReconciliationIntent: vi.fn(async () => ({
          id: '2c93ea93-ed53-48f5-be4f-3398974c70d1',
          providerId: 'yookassa',
          providerIntentRef: 'invoice-1',
          idempotencyKey: 'appointment-payment-1',
          amountMinor: 10_000,
          currency: 'RUB',
          purpose: 'appointment_prepayment',
          appointmentId: APPOINTMENT_ID,
          platformUserId: 'user-1',
          status: 'pending',
        })),
        settleProviderWebhookEvent,
      } as unknown as PaymentsPort,
      config: { getBookingPaymentSettings: async () => settings },
      captureUnitOfWork: {
        run: async (_organizationId, fn) => fn(),
        runSerializedPostCommit: async (_organizationId, _key, fn) => fn(),
      },
      bookingEngine: null,
    });

    await service.reconcileAppointmentPaymentIntent({
      organizationId: ORGANIZATION_ID,
      intentId: '2c93ea93-ed53-48f5-be4f-3398974c70d1',
    });

    expect(settleProviderWebhookEvent).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      providerId: 'yookassa',
      idempotencyKey: 'appointment-payment-1',
      eventType: 'payment.succeeded',
      intentRef: 'invoice-1',
      payloadJson: providerFact.payload,
    });
  });
});
