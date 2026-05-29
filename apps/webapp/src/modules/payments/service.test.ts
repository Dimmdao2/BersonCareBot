import { describe, expect, it, vi } from "vitest";
import { createPaymentsService } from "./service";

describe("createPaymentsService", () => {
  it("processProviderWebhook is idempotent on duplicate provider event", async () => {
    const port = {
      getPrepaymentPolicyForService: vi.fn(),
      getPrepaymentPolicyForOnlineCategory: vi.fn(),
      listPrepaymentPolicies: vi.fn(),
      upsertPrepaymentPolicy: vi.fn(),
      setAppointmentPaymentRef: vi.fn(),
      findIntentByIdempotency: vi.fn(),
      findIntentById: vi.fn().mockResolvedValue({
        id: "intent-1",
        organizationId: "org-1",
        idempotencyKey: "k1",
        providerId: "mock",
        appointmentId: "appt-1",
        platformUserId: "user-1",
        amountMinor: 100,
        currency: "RUB",
        status: "pending",
        purpose: "appointment_prepayment",
        providerIntentRef: "mock_intent_k1",
      }),
      findIntentByProviderRef: vi.fn(),
      findLatestIntentByAppointment: vi.fn(),
      createPaymentIntent: vi.fn(),
      updateIntentStatus: vi.fn().mockResolvedValue({ id: "intent-1", status: "succeeded" }),
      findPaymentByIntent: vi.fn().mockResolvedValue(null),
      findPaymentByAppointment: vi.fn(),
      createPaymentFromIntent: vi.fn().mockResolvedValue({
        id: "pay-1",
        paymentIntentId: "intent-1",
        amountMinor: 100,
        currency: "RUB",
        status: "captured",
        providerId: "mock",
        organizationId: "org-1",
        appointmentId: "appt-1",
        purpose: "appointment_prepayment",
      }),
      updatePaymentStatus: vi.fn(),
      createRefund: vi.fn(),
      recordProviderEvent: vi
        .fn()
        .mockResolvedValueOnce({ inserted: true, id: "ev-1" })
        .mockResolvedValueOnce({ inserted: false, id: "ev-1" }),
      markProviderEventProcessed: vi.fn(),
      appendHistoryEvent: vi.fn(),
      listHistoryForAppointment: vi.fn(),
      listHistoryForUser: vi.fn(),
    };
    const svc = createPaymentsService({
      port: port as never,
      config: {
        getBookingPaymentSettings: async () => ({
          enabled: true,
          defaultProviderId: "mock",
          providers: [{ id: "mock", label: "mock", enabled: true, webhookSecret: "secret" }],
        }),
      },
      bookingEngine: {
        getAppointment: vi.fn().mockResolvedValue({ id: "appt-1", status: "awaiting_payment", organizationId: "org-1" }),
        transitionAppointmentStatus: vi.fn().mockResolvedValue({}),
      },
    });
    const body = JSON.stringify({
      idempotencyKey: "wh-1",
      eventType: "payment.succeeded",
      intentId: "intent-1",
    });
    const headers = new Headers();
    const { createHmac } = await import("node:crypto");
    headers.set("x-mock-signature", createHmac("sha256", "secret").update(body).digest("hex"));

    const first = await svc.processProviderWebhook({
      organizationId: "org-1",
      providerId: "mock",
      headers,
      bodyText: body,
    });
    const second = await svc.processProviderWebhook({
      organizationId: "org-1",
      providerId: "mock",
      headers,
      bodyText: body,
    });
    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);
    expect(port.createPaymentFromIntent).toHaveBeenCalledTimes(1);
  });
});
