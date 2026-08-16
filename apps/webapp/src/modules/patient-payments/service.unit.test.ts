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
    findByProviderPaymentId: vi.fn().mockResolvedValue(payment),
    updatePatientPaymentStatus: vi.fn(),
    insertAcquiringPending: vi.fn(),
  };
}

describe('patient acquiring webhook ownership resolver', () => {
  it('does not reveal a clinic for a provider reference owned by another provider', async () => {
    const service = createPatientPaymentsService({
      patientPaymentsPort: portWithPayment(clinicPayment),
    });

    await expect(
      service.resolveAcquiringWebhookOrganization('provider-payment-1074', 'global-provider-a'),
    ).resolves.toBeNull();
  });

  it('returns the owning clinic only for the exact pending acquiring provider', async () => {
    const service = createPatientPaymentsService({
      patientPaymentsPort: portWithPayment(clinicPayment),
    });

    await expect(
      service.resolveAcquiringWebhookOrganization('provider-payment-1074', 'clinic-provider-b'),
    ).resolves.toBe('clinic-b');
  });
});
