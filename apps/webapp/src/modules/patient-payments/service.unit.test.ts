import { describe, expect, it, vi } from 'vitest';
import type { PatientPayment, PatientPaymentsPort } from './ports';
import { createPatientPaymentsService } from './service';

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
  provider: 'clinic-provider-b',
  providerPaymentId: 'provider-payment-1074',
  createdBy: 'doctor-1074',
  createdAt: '2026-08-16T00:00:00.000Z',
};

function portWithPayment(payment: PatientPayment | null): PatientPaymentsPort {
  return {
    listPayments: vi.fn(),
    addCashPayment: vi.fn(),
    // The pre-principal webhook path must not fall back to the ordinary row reader.
    findByProviderPaymentId: vi.fn().mockRejectedValue(new Error('ordinary_payment_read_forbidden')),
    resolveAcquiringWebhookOrganization: vi.fn().mockResolvedValue(payment?.organizationId ?? null),
    updatePatientPaymentStatus: vi.fn(),
    insertAcquiringPending: vi.fn(),
  };
}

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

  it('updates only the organization attached to the resolved acquiring payment', async () => {
    const port: PatientPaymentsPort = {
      ...portWithPayment(null),
      findByProviderPaymentId: vi.fn().mockResolvedValue(clinicPayment),
    };
    const service = createPatientPaymentsService({ patientPaymentsPort: port });

    await expect(
      service.handleAcquiringWebhookEvent({
        eventType: 'payment.succeeded',
        providerPaymentId: 'provider-payment-1074',
      }),
    ).resolves.toEqual({ ok: true });

    expect(port.updatePatientPaymentStatus).toHaveBeenCalledWith(
      clinicPayment.id,
      'paid',
      'clinic-b',
    );
  });
});
