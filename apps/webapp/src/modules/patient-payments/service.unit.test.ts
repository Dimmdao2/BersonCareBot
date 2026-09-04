import { describe, expect, it, vi } from 'vitest';
import type { PatientPayment, PatientPaymentsPort } from './ports';
import { createPatientPaymentsService } from './service';
import {
  __resetInMemoryPatientPaymentsForTest,
  inMemoryPatientPaymentsPort,
} from '@/infra/repos/inMemoryPatientPayments';

const clinicPayment: PatientPayment = {
  id: 'payment-1074',
  organizationId: 'clinic-b',
  patientUserId: 'patient-1074',
  amountMinor: 12_345,
  currency: 'RUB',
  kind: 'acquiring',
  status: 'pending',
  comment: null,
  service: null,
  visitId: null,
  appointmentId: null,
  patientPackageId: null,
  idempotencyKey: null,
  provider: 'clinic-provider-b',
  providerPaymentId: 'provider-payment-1074',
  createdBy: 'doctor-1074',
  createdAt: '2026-08-16T00:00:00.000Z',
};

function portWithPayment(payment: PatientPayment | null): PatientPaymentsPort {
  return {
    listPayments: vi.fn(),
    listAppointmentPayments: vi.fn(),
    addCashPayment: vi.fn(),
    resolveAcquiringWebhookOrganization: vi.fn().mockResolvedValue(payment?.organizationId ?? null),
    settleAcquiringWebhookPayment: vi.fn().mockResolvedValue('settled' as const),
    insertAcquiringPending: vi.fn(),
  };
}

const pendingAcquiring = {
  organizationId: 'clinic-collision',
  patientUserId: 'patient-collision',
  amountMinor: 1_000,
  currency: 'RUB',
  providerPaymentId: 'collision-ref',
  createdBy: 'doctor-collision',
};

describe('patient acquiring webhook ownership resolver', () => {
  it('returns only the dedicated bootstrap resolver result, never an ordinary payment row', async () => {
    const service = createPatientPaymentsService({
      patientPaymentsPort: portWithPayment(clinicPayment),
    });

    await expect(
      service.resolveAcquiringWebhookOrganization('provider-payment-1074', 'clinic-provider-b'),
    ).resolves.toBe('clinic-b');
  });

  it('does not query the bootstrap resolver for blank untrusted identity values', async () => {
    const port = portWithPayment(clinicPayment);
    const service = createPatientPaymentsService({ patientPaymentsPort: port });

    await expect(service.resolveAcquiringWebhookOrganization(' ', 'clinic-provider-b')).resolves.toBeNull();
    expect(port.resolveAcquiringWebhookOrganization).not.toHaveBeenCalled();
  });
});

describe('patient acquiring webhook settlement', () => {
  it('settles a paid callback through one clinic-scoped operation that names no organization', async () => {
    const port = portWithPayment(null);
    const service = createPatientPaymentsService({ patientPaymentsPort: port });

    await expect(
      service.handleAcquiringWebhookEvent({
        eventType: 'payment.succeeded',
        providerId: 'clinic-provider-b',
        providerPaymentId: 'provider-payment-1074',
      }),
    ).resolves.toEqual({ ok: true });

    // The clinic is the installed principal, never an argument: nothing this service passes could
    // address another tenant's payment.
    expect(port.settleAcquiringWebhookPayment).toHaveBeenCalledExactlyOnceWith({
      providerId: 'clinic-provider-b',
      providerPaymentId: 'provider-payment-1074',
      status: 'paid',
    });
  });

  it.each([['payment.canceled'], ['payment.failed']])(
    'settles %s as a failed payment',
    async (eventType) => {
      const port = portWithPayment(null);
      const service = createPatientPaymentsService({ patientPaymentsPort: port });

      await expect(
        service.handleAcquiringWebhookEvent({
          eventType,
          providerId: 'clinic-provider-b',
          providerPaymentId: 'provider-payment-1074',
        }),
      ).resolves.toEqual({ ok: true });

      expect(port.settleAcquiringWebhookPayment).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'failed' }),
      );
    },
  );

  it('acknowledges an event type that carries no transition without touching the ledger', async () => {
    const port = portWithPayment(null);
    const service = createPatientPaymentsService({ patientPaymentsPort: port });

    await expect(
      service.handleAcquiringWebhookEvent({
        eventType: 'payment.waiting_for_capture',
        providerId: 'clinic-provider-b',
        providerPaymentId: 'provider-payment-1074',
      }),
    ).resolves.toEqual({ ok: true, alreadyProcessed: true });
    expect(port.settleAcquiringWebhookPayment).not.toHaveBeenCalled();
  });

  it('reports a repeated callback as already handled', async () => {
    const port = portWithPayment(null);
    port.settleAcquiringWebhookPayment = vi.fn().mockResolvedValue('already_processed' as const);
    const service = createPatientPaymentsService({ patientPaymentsPort: port });

    await expect(
      service.handleAcquiringWebhookEvent({
        eventType: 'payment.succeeded',
        providerId: 'clinic-provider-b',
        providerPaymentId: 'provider-payment-1074',
      }),
    ).resolves.toEqual({ ok: true, alreadyProcessed: true });
  });

  it('reports a reference the clinic does not own as a payment that was not found', async () => {
    const port = portWithPayment(null);
    port.settleAcquiringWebhookPayment = vi.fn().mockResolvedValue('not_found' as const);
    const service = createPatientPaymentsService({ patientPaymentsPort: port });

    await expect(
      service.handleAcquiringWebhookEvent({
        eventType: 'payment.succeeded',
        providerId: 'clinic-provider-b',
        providerPaymentId: 'provider-payment-1074',
      }),
    ).resolves.toEqual({ ok: false, reason: 'payment_not_found' });
  });

  it('moves only the exact provider row when providers share one payment reference', async () => {
    __resetInMemoryPatientPaymentsForTest();
    await inMemoryPatientPaymentsPort.insertAcquiringPending({
      ...pendingAcquiring,
      provider: 'provider-b',
    });
    await inMemoryPatientPaymentsPort.insertAcquiringPending({
      ...pendingAcquiring,
      provider: 'provider-a',
    });
    const service = createPatientPaymentsService({
      patientPaymentsPort: inMemoryPatientPaymentsPort,
    });

    await expect(
      service.handleAcquiringWebhookEvent({
        eventType: 'payment.succeeded',
        providerId: 'provider-a',
        providerPaymentId: 'collision-ref',
      }),
    ).resolves.toEqual({ ok: true });

    await expect(
      inMemoryPatientPaymentsPort.listPayments(pendingAcquiring.patientUserId),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ provider: 'provider-a', status: 'paid' }),
        expect.objectContaining({ provider: 'provider-b', status: 'pending' }),
      ]),
    );
  });

  it('does not settle a paid row twice when the acquirer repeats the same callback', async () => {
    __resetInMemoryPatientPaymentsForTest();
    await inMemoryPatientPaymentsPort.insertAcquiringPending({
      ...pendingAcquiring,
      provider: 'provider-a',
    });
    const service = createPatientPaymentsService({
      patientPaymentsPort: inMemoryPatientPaymentsPort,
    });
    const event = {
      eventType: 'payment.succeeded',
      providerId: 'provider-a',
      providerPaymentId: 'collision-ref',
    };

    await expect(service.handleAcquiringWebhookEvent(event)).resolves.toEqual({ ok: true });
    // A cancellation arriving after the capture must not undo a paid row either.
    await expect(
      service.handleAcquiringWebhookEvent({ ...event, eventType: 'payment.canceled' }),
    ).resolves.toEqual({ ok: true, alreadyProcessed: true });

    await expect(
      inMemoryPatientPaymentsPort.listPayments(pendingAcquiring.patientUserId),
    ).resolves.toEqual([expect.objectContaining({ provider: 'provider-a', status: 'paid' })]);
  });

  it('fails closed without an update for missing or ambiguous exact provider references', async () => {
    __resetInMemoryPatientPaymentsForTest();
    const common = { ...pendingAcquiring, provider: 'provider-a' };
    await inMemoryPatientPaymentsPort.insertAcquiringPending(common);
    await inMemoryPatientPaymentsPort.insertAcquiringPending(common);
    const service = createPatientPaymentsService({
      patientPaymentsPort: inMemoryPatientPaymentsPort,
    });

    await expect(
      service.handleAcquiringWebhookEvent({
        eventType: 'payment.succeeded',
        providerId: 'provider-c',
        providerPaymentId: 'collision-ref',
      }),
    ).resolves.toEqual({ ok: false, reason: 'payment_not_found' });
    await expect(
      service.handleAcquiringWebhookEvent({
        eventType: 'payment.succeeded',
        providerId: 'provider-a',
        providerPaymentId: 'collision-ref',
      }),
    ).resolves.toEqual({ ok: false, reason: 'payment_not_found' });

    await expect(
      inMemoryPatientPaymentsPort.listPayments(common.patientUserId),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ provider: 'provider-a', status: 'pending' }),
        expect.objectContaining({ provider: 'provider-a', status: 'pending' }),
      ]),
    );
  });
});
