/**
 * A paid provider notification must reach our journal once, and a provider retry must not pay,
 * confirm or notify a second time.
 *
 * Live defect (TEST, 2026-09-05): a YooKassa test payment of 7 000 ₽ succeeded, the provider
 * delivered `POST /api/payments/webhook/yookassa` three times, and every delivery answered HTTP 400
 * — the capture walked ten separate relation reads/writes under a principal (`tenant_service`) that
 * the webapp port grants no relation door at all. The money left the payer and the appointment
 * payment view stayed `pending`. The capture is one server-authorized door now; this file holds the
 * behaviour that door owes the payer.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPaymentsService } from './service';
import type { PaymentsPort, ProviderWebhookSettlement } from './ports';
import type { BookingPaymentSettings } from './types';

const providerAdapter = vi.hoisted(() => ({
  verifyWebhook: vi.fn(),
}));

vi.mock('@/infra/payments/paymentProviderRegistry', () => ({
  getPaymentProviderAdapter: vi.fn(() => providerAdapter),
}));
vi.mock('@/modules/system-settings/appDisplayTimezone', () => ({
  getAppDisplayTimeZone: vi.fn(async () => 'Europe/Moscow'),
}));

import { createAppointmentPaymentConfirmedHandler } from '@/app-layer/booking/appointmentPaymentConfirmedHandler';
import type { PatientBookingRecord } from '@/modules/patient-booking/types';

const ORGANIZATION_ID = 'org-1';
const APPOINTMENT_ID = 'f92ec4bb-2913-470a-a522-7851bb14ec2d';
const PAYMENT_ID = 'payment-1';
const PATIENT_ID = 'user-1';

const settings: BookingPaymentSettings = {
  enabled: true,
  defaultProviderId: 'yookassa',
  providers: [
    {
      id: 'yookassa',
      enabled: true,
      shopId: 'shop-1',
      apiKey: 'key-1',
      webhookSecret: 'hook-1',
    },
  ],
} as unknown as BookingPaymentSettings;

const verified = {
  idempotencyKey: `appointment-prepayment:${APPOINTMENT_ID}`,
  eventType: 'payment.succeeded',
  intentRef: '  2f4b9c1a-000f-5000-a000-1d0f0a0b0c0d  ',
  payload: { event: 'payment.succeeded' },
  amountMinor: 700_000,
};

const captured: ProviderWebhookSettlement = {
  outcome: 'captured',
  duplicate: false,
  paymentId: PAYMENT_ID,
  platformUserId: PATIENT_ID,
  productRef: null,
  confirmedAppointmentIds: [APPOINTMENT_ID],
};

/** The same notification arriving again: the door reports it, and nothing further may happen. */
const alreadyProcessed: ProviderWebhookSettlement = {
  outcome: 'already_processed',
  duplicate: true,
  paymentId: null,
  platformUserId: null,
  productRef: null,
  confirmedAppointmentIds: [],
};

function buildService(settlements: ProviderWebhookSettlement[]) {
  const settleProviderWebhookEvent = vi.fn(async () => settlements.shift() ?? alreadyProcessed);
  const onAppointmentPaymentConfirmed = vi.fn(async () => {});
  const onPackagePaymentCaptured = vi.fn(async () => {});
  const service = createPaymentsService({
    port: { settleProviderWebhookEvent } as unknown as PaymentsPort,
    config: { getBookingPaymentSettings: async () => settings },
    captureUnitOfWork: {
      run: async (_orgId, fn) => fn(),
      runSerializedPostCommit: async (_orgId, _key, fn) => fn(),
    },
    bookingEngine: null,
    onAppointmentPaymentConfirmed,
    onPackagePaymentCaptured,
  });
  return { service, settleProviderWebhookEvent, onAppointmentPaymentConfirmed };
}

function deliver(service: ReturnType<typeof createPaymentsService>) {
  return service.processProviderWebhook({
    organizationId: ORGANIZATION_ID,
    providerId: 'yookassa',
    headers: new Headers(),
    bodyText: '{}',
  });
}

describe('booking payment provider webhook capture', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    providerAdapter.verifyWebhook.mockResolvedValue(verified);
  });

  it('settles the verified notification through the single tenant door and confirms the appointment', async () => {
    const { service, settleProviderWebhookEvent, onAppointmentPaymentConfirmed } = buildService([
      captured,
    ]);

    await expect(deliver(service)).resolves.toEqual({ ok: true, duplicate: false });

    // What is settled is what the API refetch confirmed, not what the untrusted body claimed.
    expect(settleProviderWebhookEvent).toHaveBeenCalledTimes(1);
    expect(settleProviderWebhookEvent).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      providerId: 'yookassa',
      idempotencyKey: verified.idempotencyKey,
      eventType: 'payment.succeeded',
      intentRef: '2f4b9c1a-000f-5000-a000-1d0f0a0b0c0d',
      payloadJson: verified.payload,
    });
    expect(onAppointmentPaymentConfirmed).toHaveBeenCalledTimes(1);
    expect(onAppointmentPaymentConfirmed).toHaveBeenCalledWith({
      appointmentId: APPOINTMENT_ID,
      paymentId: PAYMENT_ID,
      platformUserId: PATIENT_ID,
    });
  });

  it('answers a provider retry as a duplicate without capturing or notifying again', async () => {
    const { service, settleProviderWebhookEvent, onAppointmentPaymentConfirmed } = buildService([
      captured,
      alreadyProcessed,
    ]);

    await deliver(service);
    await expect(deliver(service)).resolves.toEqual({ ok: true, duplicate: true });

    expect(settleProviderWebhookEvent).toHaveBeenCalledTimes(2);
    // ЮKassa delivered this notification three times against the live incident; the payer owes one
    // payment and one confirmation regardless of how many deliveries arrive.
    expect(onAppointmentPaymentConfirmed).toHaveBeenCalledTimes(1);
  });

  it('does not re-notify on a retry that still names the settled payment', async () => {
    // The outcome, not the presence of a payment id, decides whether anything new happened: a door
    // that reports the already-settled payment back must not turn every provider retry into another
    // «оплата подтверждена» to the patient.
    const { service, onAppointmentPaymentConfirmed } = buildService([
      {
        ...alreadyProcessed,
        paymentId: PAYMENT_ID,
        platformUserId: PATIENT_ID,
        confirmedAppointmentIds: [APPOINTMENT_ID],
      },
    ]);

    await expect(deliver(service)).resolves.toEqual({ ok: true, duplicate: true });
    expect(onAppointmentPaymentConfirmed).not.toHaveBeenCalled();
  });

  /**
   * S5.3 audit oracle: one combined payment for one multi-slot booking has one successful-payment
   * notification. The per-appointment projection still needs updating, but it must not fan the same
   * payment success out to the patient once per slot.
   */
  it('emits one patient payment-success message for one paid multi-slot booking', async () => {
    const secondAppointmentId = '2f185df8-642e-40f0-8028-71a578ba3389';
    const emitted: Array<Record<string, unknown>> = [];
    const recordFor = (appointmentId: string, hour: number): PatientBookingRecord => ({
      id: `booking-${appointmentId}`,
      organizationId: ORGANIZATION_ID,
      userId: PATIENT_ID,
      bookingType: 'in_person',
      city: 'msk',
      category: 'general',
      slotStart: `2027-03-10T0${hour}:00:00.000Z`,
      slotEnd: `2027-03-10T${String(hour + 1).padStart(2, '0')}:00:00.000Z`,
      status: 'confirmed',
      cancelledAt: null,
      cancelReason: null,
      gcalEventId: null,
      contactPhone: '+79990000000',
      contactEmail: null,
      contactName: 'Пациент',
      reminder24hSent: false,
      reminder2hSent: false,
      createdAt: '2027-03-01T00:00:00.000Z',
      updatedAt: '2027-03-01T00:00:00.000Z',
      branchServiceId: null,
      branchId: null,
      serviceId: null,
      cityCodeSnapshot: 'msk',
      branchTitleSnapshot: 'Клиника',
      serviceTitleSnapshot: 'Приём',
      durationMinutesSnapshot: 60,
      priceMinorSnapshot: 5_000,
      canonicalAppointmentId: appointmentId,
      provenanceCreatedBy: null,
      provenanceUpdatedBy: null,
    });
    const records = new Map([
      [APPOINTMENT_ID, recordFor(APPOINTMENT_ID, 9)],
      [secondAppointmentId, recordFor(secondAppointmentId, 10)],
    ]);
    const handler = createAppointmentPaymentConfirmedHandler({
      patientBookings: {
        markConfirmedByCanonicalAppointment: vi.fn(async (appointmentId: string) =>
          records.get(appointmentId) ?? null,
        ),
        getByCanonicalAppointmentId: vi.fn(async (appointmentId: string) =>
          records.get(appointmentId) ?? null,
        ),
      },
      bookingEngine: {
        getAppointment: vi.fn(async (appointmentId: string) => ({
          id: appointmentId,
          organizationId: ORGANIZATION_ID,
          appointmentReminderPresetId: null,
        }) as never),
      },
      loadNotificationSettings: vi.fn(async () => null as never),
      bookingSync: {
        emitBookingEvent: vi.fn(async (event) => {
          emitted.push(event as unknown as Record<string, unknown>);
        }),
      },
    });
    const settleProviderWebhookEvent = vi.fn(async () => ({
      ...captured,
      confirmedAppointmentIds: [APPOINTMENT_ID, secondAppointmentId],
    }));
    const service = createPaymentsService({
      port: { settleProviderWebhookEvent } as unknown as PaymentsPort,
      config: { getBookingPaymentSettings: async () => settings },
      captureUnitOfWork: {
        run: async (_orgId, fn) => fn(),
        runSerializedPostCommit: async (_orgId, _key, fn) => fn(),
      },
      bookingEngine: null,
      onAppointmentPaymentConfirmed: handler,
    });

    await deliver(service);

    expect(emitted).toHaveLength(1);
  });

  it('notifies nobody when the door captured nothing', async () => {
    const { service, onAppointmentPaymentConfirmed } = buildService([
      { ...alreadyProcessed, outcome: 'intent_not_found', duplicate: false },
    ]);

    await expect(deliver(service)).resolves.toEqual({ ok: true, duplicate: false });
    expect(onAppointmentPaymentConfirmed).not.toHaveBeenCalled();
  });

  it('refuses to settle for a provider this clinic has not enabled', async () => {
    const { service, settleProviderWebhookEvent } = buildService([captured]);

    await expect(
      service.processProviderWebhook({
        organizationId: ORGANIZATION_ID,
        providerId: 'tinkoff',
        headers: new Headers(),
        bodyText: '{}',
      }),
    ).rejects.toThrow('payment_provider_unavailable');
    expect(settleProviderWebhookEvent).not.toHaveBeenCalled();
  });
});
