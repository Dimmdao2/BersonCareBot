import { describe, expect, it, vi } from "vitest";
import type { PatientPaymentsPort } from "./ports";
import { createPatientPaymentsService } from "./service";

const BASE_PAYMENT = {
  id: "payment-1",
  organizationId: "11111111-1111-4111-8111-111111111111",
  patientUserId: "22222222-2222-4222-8222-222222222222",
  amountMinor: 1000,
  currency: "RUB",
  kind: "acquiring" as const,
  status: "pending" as const,
  comment: null,
  service: null,
  visitId: null,
  provider: "mock",
  providerPaymentId: "provider-payment-1",
  createdBy: "33333333-3333-4333-8333-333333333333",
  createdAt: "2026-07-08T00:00:00.000Z",
};

function createPort(overrides: Partial<PatientPaymentsPort> = {}): PatientPaymentsPort {
  return {
    listPayments: vi.fn(),
    addCashPayment: vi.fn(),
    findByProviderPaymentId: vi.fn().mockResolvedValue(BASE_PAYMENT),
    updatePatientPaymentStatus: vi.fn(),
    insertAcquiringPending: vi.fn(),
    ...overrides,
  };
}

describe("createPatientPaymentsService", () => {
  it("updates acquiring webhook status under the payment organization", async () => {
    const port = createPort();
    const service = createPatientPaymentsService({ patientPaymentsPort: port });

    const result = await service.handleAcquiringWebhookEvent({
      eventType: "payment.succeeded",
      providerPaymentId: "provider-payment-1",
    });

    expect(result).toEqual({ ok: true });
    expect(port.updatePatientPaymentStatus).toHaveBeenCalledWith(
      "payment-1",
      "paid",
      "11111111-1111-4111-8111-111111111111",
    );
  });

  it("does not invent an organization for legacy acquiring rows without org", async () => {
    const port = createPort({
      findByProviderPaymentId: vi.fn().mockResolvedValue({
        ...BASE_PAYMENT,
        organizationId: null,
      }),
    });
    const service = createPatientPaymentsService({ patientPaymentsPort: port });

    const result = await service.handleAcquiringWebhookEvent({
      eventType: "payment.succeeded",
      providerPaymentId: "provider-payment-1",
    });

    expect(result).toEqual({ ok: false, reason: "payment_org_missing" });
    expect(port.updatePatientPaymentStatus).not.toHaveBeenCalled();
  });
});
