import { describe, expect, it, vi } from "vitest";
import { createPaymentsService } from "./service";

const captureUnitOfWork = {
  async run<T>(_organizationId: string, fn: () => Promise<T>): Promise<T> {
    return fn();
  },
  async runSerializedPostCommit<T>(
    _organizationId: string,
    _captureKey: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    return fn();
  },
};

function providerEvent(input: {
  inserted: boolean;
  id: string;
  processedAt: string | null;
  payloadJson?: Record<string, unknown>;
}) {
  return {
    ...input,
    organizationId: "org-1",
    providerId: "mock",
    idempotencyKey: "provider-event-key",
    eventType: "payment.succeeded",
    intentRef: null,
    payloadJson: input.payloadJson ?? { intentId: "intent-1" },
  };
}

function deferred() {
  let resolvePromise: () => void = () => undefined;
  const promise = new Promise<void>((resolve) => {
    resolvePromise = resolve;
  });
  return { promise, resolve: resolvePromise };
}

describe("createPaymentsService", () => {
  it("replays an unprocessed duplicate provider event after a capture crash", async () => {
    const intent = {
      id: "intent-crash",
      organizationId: "org-1",
      idempotencyKey: "intent-key",
      providerId: "mock",
      appointmentId: null,
      platformUserId: "user-1",
      productRef: null,
      amountMinor: 100,
      currency: "RUB",
      status: "pending",
      purpose: "appointment_prepayment",
      providerIntentRef: "mock_intent_crash",
    };
    let captureAttempts = 0;
    const port = {
      recordProviderEvent: vi
        .fn()
        .mockResolvedValueOnce(
          providerEvent({
            inserted: true,
            id: "event-crash",
            processedAt: null,
            payloadJson: { intentId: intent.id },
          }),
        )
        .mockResolvedValueOnce(
          providerEvent({
            inserted: false,
            id: "event-crash",
            processedAt: null,
            payloadJson: { intentId: intent.id },
          }),
        ),
      getProviderEventById: vi.fn().mockResolvedValue(
        providerEvent({
          inserted: false,
          id: "event-crash",
          processedAt: null,
          payloadJson: { intentId: intent.id },
        }),
      ),
      findIntentById: vi.fn().mockResolvedValue(intent),
      lockIntentForCapture: vi.fn().mockResolvedValue(intent),
      findIntentByProviderRef: vi.fn(),
      updateIntentStatus: vi.fn().mockImplementation(async () => {
        captureAttempts += 1;
        if (captureAttempts === 1) throw new Error("simulated_capture_crash");
        return { ...intent, status: "succeeded" };
      }),
      findPaymentByIntent: vi.fn().mockResolvedValue(null),
      createPaymentFromIntent: vi.fn().mockResolvedValue({
        id: "payment-crash",
        organizationId: "org-1",
        paymentIntentId: "intent-crash",
        appointmentId: null,
        amountMinor: 100,
        currency: "RUB",
        status: "captured",
        providerId: "mock",
        purpose: "appointment_prepayment",
      }),
      appendHistoryEvent: vi.fn(),
      hasCapturedHistoryEvent: vi.fn().mockResolvedValue(false),
      markProviderEventProcessed: vi.fn(),
    };
    const service = createPaymentsService({
      port: port as never,
      config: {
        getBookingPaymentSettings: async () => ({
          enabled: true,
          defaultProviderId: "mock",
          providers: [{ id: "mock", label: "mock", enabled: true, webhookSecret: "secret" }],
        }),
      },
      captureUnitOfWork,
      bookingEngine: null,
    });
    const bodyText = JSON.stringify({
      idempotencyKey: "provider-event-crash",
      eventType: "payment.succeeded",
      intentId: intent.id,
    });
    const { createHmac } = await import("node:crypto");
    const headers = new Headers({
      "x-mock-signature": createHmac("sha256", "secret").update(bodyText).digest("hex"),
    });

    await expect(
      service.processProviderWebhook({
        organizationId: "org-1",
        providerId: "mock",
        headers,
        bodyText,
      }),
    ).rejects.toThrow("simulated_capture_crash");
    await expect(
      service.processProviderWebhook({
        organizationId: "org-1",
        providerId: "mock",
        headers,
        bodyText,
      }),
    ).resolves.toMatchObject({ ok: true, duplicate: true });

    expect(port.updateIntentStatus).toHaveBeenCalledTimes(2);
    expect(port.createPaymentFromIntent).toHaveBeenCalledTimes(1);
    expect(port.markProviderEventProcessed).toHaveBeenCalledWith("event-crash", "org-1");
  });

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
      lockIntentForCapture: vi.fn().mockResolvedValue({
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
      findIntentByProviderRefAnyOrg: vi.fn(),
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
        .mockResolvedValueOnce(
          providerEvent({
            inserted: true,
            id: "ev-1",
            processedAt: null,
            payloadJson: { intentId: "intent-1" },
          }),
        )
        .mockResolvedValueOnce(
          providerEvent({
            inserted: false,
            id: "ev-1",
            processedAt: "2026-07-21T12:00:00.000Z",
            payloadJson: { intentId: "intent-1" },
          }),
        ),
      getProviderEventById: vi.fn().mockResolvedValue(
        providerEvent({
          inserted: false,
          id: "ev-1",
          processedAt: null,
          payloadJson: { intentId: "intent-1" },
        }),
      ),
      markProviderEventProcessed: vi.fn(),
      hasCapturedHistoryEvent: vi.fn().mockResolvedValue(false),
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
      captureUnitOfWork,
      bookingEngine: {
        getAppointment: vi
          .fn()
          .mockResolvedValue({ id: "appt-1", status: "awaiting_payment", organizationId: "org-1" }),
        listAppointmentsByChainId: vi.fn().mockResolvedValue([]),
        transitionAppointmentStatus: vi.fn().mockResolvedValue({}),
      } as never,
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
    expect(port.updateIntentStatus).toHaveBeenCalledWith("intent-1", "succeeded", "org-1");
    expect(port.setAppointmentPaymentRef).toHaveBeenCalledWith("appt-1", "pay-1", "org-1");
    expect(port.markProviderEventProcessed).toHaveBeenCalledWith("ev-1", "org-1");
  });

  it("replays post-commit appointment delivery before marking the provider event processed", async () => {
    const intent = {
      id: "intent-delivery",
      organizationId: "org-1",
      idempotencyKey: "delivery-key",
      providerId: "mock",
      appointmentId: "appointment-1",
      platformUserId: "user-1",
      productRef: null,
      amountMinor: 100,
      currency: "RUB",
      status: "pending",
      purpose: "appointment_prepayment",
      providerIntentRef: "mock_intent_delivery",
    };
    const payment = {
      id: "payment-delivery",
      organizationId: "org-1",
      paymentIntentId: intent.id,
      appointmentId: intent.appointmentId,
      amountMinor: 100,
      currency: "RUB",
      status: "captured",
      providerId: "mock",
      purpose: "appointment_prepayment",
    };
    let intentStatus = "pending";
    let storedPayment: typeof payment | null = null;
    let historyExists = false;
    let appointmentStatus = "awaiting_payment";
    const port = {
      recordProviderEvent: vi
        .fn()
        .mockResolvedValueOnce(
          providerEvent({
            inserted: true,
            id: "event-delivery",
            processedAt: null,
            payloadJson: { intentId: intent.id },
          }),
        )
        .mockResolvedValueOnce(
          providerEvent({
            inserted: false,
            id: "event-delivery",
            processedAt: null,
            payloadJson: { intentId: intent.id },
          }),
        ),
      getProviderEventById: vi.fn().mockResolvedValue(
        providerEvent({
          inserted: false,
          id: "event-delivery",
          processedAt: null,
          payloadJson: { intentId: intent.id },
        }),
      ),
      findIntentById: vi.fn(async () => ({ ...intent, status: intentStatus })),
      findIntentByProviderRef: vi.fn(),
      lockIntentForCapture: vi.fn(async () => ({ ...intent, status: intentStatus })),
      updateIntentStatus: vi.fn(async () => {
        intentStatus = "succeeded";
        return { ...intent, status: intentStatus };
      }),
      findPaymentByIntent: vi.fn(async () => storedPayment),
      createPaymentFromIntent: vi.fn(async () => {
        storedPayment = payment;
        return payment;
      }),
      hasCapturedHistoryEvent: vi.fn(async () => historyExists),
      appendHistoryEvent: vi.fn(async () => {
        historyExists = true;
      }),
      setAppointmentPaymentRef: vi.fn(),
      markProviderEventProcessed: vi.fn(),
    };
    const onAppointmentPaymentConfirmed = vi
      .fn()
      .mockRejectedValueOnce(new Error("post_commit_delivery_crash"))
      .mockResolvedValueOnce(undefined);
    const service = createPaymentsService({
      port: port as never,
      config: {
        getBookingPaymentSettings: async () => ({
          enabled: true,
          defaultProviderId: "mock",
          providers: [{ id: "mock", label: "mock", enabled: true, webhookSecret: "secret" }],
        }),
      },
      captureUnitOfWork,
      bookingEngine: {
        getAppointment: vi.fn(async () => ({
          id: "appointment-1",
          organizationId: "org-1",
          chainId: null,
          status: appointmentStatus,
        })),
        listAppointmentsByChainId: vi.fn(),
        transitionAppointmentStatus: vi.fn(async ({ toStatus }) => {
          appointmentStatus = toStatus;
          return {} as never;
        }),
      } as never,
      onAppointmentPaymentConfirmed,
    });
    const bodyText = JSON.stringify({
      idempotencyKey: "event-delivery-key",
      eventType: "payment.succeeded",
      intentId: intent.id,
    });
    const { createHmac } = await import("node:crypto");
    const headers = new Headers({
      "x-mock-signature": createHmac("sha256", "secret").update(bodyText).digest("hex"),
    });

    await expect(
      service.processProviderWebhook({
        organizationId: "org-1",
        providerId: "mock",
        headers,
        bodyText,
      }),
    ).rejects.toThrow("post_commit_delivery_crash");
    expect(port.markProviderEventProcessed).not.toHaveBeenCalled();

    await expect(
      service.processProviderWebhook({
        organizationId: "org-1",
        providerId: "mock",
        headers,
        bodyText,
      }),
    ).resolves.toMatchObject({ ok: true, duplicate: true });
    expect(onAppointmentPaymentConfirmed).toHaveBeenCalledTimes(2);
    expect(port.createPaymentFromIntent).toHaveBeenCalledTimes(1);
    expect(port.appendHistoryEvent).toHaveBeenCalledTimes(1);
    expect(port.markProviderEventProcessed).toHaveBeenCalledWith("event-delivery", "org-1");
  });

  it("serializes concurrent duplicates through post-commit delivery and rechecks processed state", async () => {
    let processedAt: string | null = null;
    let intentStatus = "pending";
    let payment: Record<string, unknown> | null = null;
    let appointmentStatus = "awaiting_payment";
    const deliveryEntered = deferred();
    const deliveryGate = deferred();
    const intent = {
      id: "intent-concurrent",
      organizationId: "org-1",
      idempotencyKey: "intent-concurrent-key",
      providerId: "mock",
      appointmentId: "appointment-concurrent",
      platformUserId: "user-1",
      productRef: null,
      amountMinor: 100,
      currency: "RUB",
      status: "pending",
      purpose: "appointment_prepayment",
      providerIntentRef: "mock_intent_concurrent",
    };
    const stored = () =>
      providerEvent({
        inserted: false,
        id: "event-concurrent",
        processedAt,
        payloadJson: { intentId: intent.id },
      });
    const port = {
      recordProviderEvent: vi.fn(async () => stored()),
      getProviderEventById: vi.fn(async () => stored()),
      findIntentById: vi.fn(async () => ({ ...intent, status: intentStatus })),
      findIntentByProviderRef: vi.fn(),
      lockIntentForCapture: vi.fn(async () => ({ ...intent, status: intentStatus })),
      updateIntentStatus: vi.fn(async () => {
        intentStatus = "succeeded";
        return { ...intent, status: intentStatus };
      }),
      findPaymentByIntent: vi.fn(async () => payment),
      createPaymentFromIntent: vi.fn(async () => {
        payment = {
          id: "payment-concurrent",
          organizationId: "org-1",
          paymentIntentId: intent.id,
          appointmentId: intent.appointmentId,
          amountMinor: 100,
          currency: "RUB",
          status: "captured",
          providerId: "mock",
          purpose: "appointment_prepayment",
        };
        return payment;
      }),
      hasCapturedHistoryEvent: vi.fn().mockResolvedValue(false),
      appendHistoryEvent: vi.fn(),
      setAppointmentPaymentRef: vi.fn(),
      markProviderEventProcessed: vi.fn(async () => {
        processedAt = "2026-07-21T12:00:00.000Z";
      }),
    };
    let serializedTail = Promise.resolve();
    const service = createPaymentsService({
      port: port as never,
      config: {
        getBookingPaymentSettings: async () => ({
          enabled: true,
          defaultProviderId: "mock",
          providers: [{ id: "mock", label: "mock", enabled: true, webhookSecret: "secret" }],
        }),
      },
      captureUnitOfWork: {
        run: async <T>(_organizationId: string, fn: () => Promise<T>) => fn(),
        runSerializedPostCommit: async <T>(
          _organizationId: string,
          _captureKey: string,
          fn: () => Promise<T>,
        ) => {
          const previous = serializedTail;
          let releaseCurrent: () => void = () => undefined;
          serializedTail = new Promise<void>((resolve) => {
            releaseCurrent = resolve;
          });
          await previous;
          try {
            return await fn();
          } finally {
            releaseCurrent();
          }
        },
      },
      bookingEngine: {
        getAppointment: vi.fn(async () => ({
          id: intent.appointmentId,
          organizationId: "org-1",
          chainId: null,
          status: appointmentStatus,
        })),
        listAppointmentsByChainId: vi.fn(),
        transitionAppointmentStatus: vi.fn(async ({ toStatus }) => {
          appointmentStatus = toStatus;
          return {} as never;
        }),
      } as never,
      onAppointmentPaymentConfirmed: vi.fn(async () => {
        deliveryEntered.resolve();
        await deliveryGate.promise;
      }),
    });
    const bodyText = JSON.stringify({
      idempotencyKey: "event-concurrent-key",
      eventType: "payment.succeeded",
      intentId: intent.id,
    });
    const { createHmac } = await import("node:crypto");
    const headers = new Headers({
      "x-mock-signature": createHmac("sha256", "secret").update(bodyText).digest("hex"),
    });
    const input = { organizationId: "org-1", providerId: "mock", headers, bodyText };

    const first = service.processProviderWebhook(input);
    await deliveryEntered.promise;
    const second = service.processProviderWebhook(input);
    await Promise.resolve();
    expect(port.markProviderEventProcessed).not.toHaveBeenCalled();
    expect(port.lockIntentForCapture).toHaveBeenCalledTimes(1);

    deliveryGate.resolve();
    await expect(Promise.all([first, second])).resolves.toEqual([
      { ok: true, duplicate: true },
      { ok: true, duplicate: true },
    ]);
    expect(port.lockIntentForCapture).toHaveBeenCalledTimes(1);
    expect(port.markProviderEventProcessed).toHaveBeenCalledTimes(1);
  });

  it("resolves webhook organization from intent id or provider ref", async () => {
    const port = {
      findIntentById: vi.fn().mockResolvedValueOnce({
        id: "intent-1",
        organizationId: "org-from-id",
      }),
      findIntentByProviderRefAnyOrg: vi.fn().mockResolvedValueOnce({
        id: "intent-2",
        organizationId: "org-from-provider-ref",
      }),
    };
    const svc = createPaymentsService({
      port: port as never,
      config: {
        getBookingPaymentSettings: async () => ({
          enabled: true,
          defaultProviderId: "mock",
          providers: [],
        }),
      },
      captureUnitOfWork,
      bookingEngine: null,
    });

    await expect(
      svc.resolveProviderWebhookOrganizationId({
        providerId: "mock",
        intentId: "intent-1",
        providerIntentRef: "ref-1",
      }),
    ).resolves.toBe("org-from-id");
    expect(port.findIntentByProviderRefAnyOrg).not.toHaveBeenCalled();

    await expect(
      svc.resolveProviderWebhookOrganizationId({
        providerId: "mock",
        intentId: null,
        providerIntentRef: "ref-2",
      }),
    ).resolves.toBe("org-from-provider-ref");
    expect(port.findIntentByProviderRefAnyOrg).toHaveBeenCalledWith("mock", "ref-2");
  });

  it("links and confirms every appointment in a paid chain", async () => {
    const port = {
      findIntentById: vi.fn().mockResolvedValue({
        id: "intent-1",
        organizationId: "org-1",
        appointmentId: "appt-1",
        platformUserId: "user-1",
        status: "pending",
        amountMinor: 300,
        currency: "RUB",
        providerId: "mock",
        purpose: "appointment_prepayment",
      }),
      lockIntentForCapture: vi.fn().mockResolvedValue({
        id: "intent-1",
        organizationId: "org-1",
        appointmentId: "appt-1",
        platformUserId: "user-1",
        status: "pending",
        amountMinor: 300,
        currency: "RUB",
        providerId: "mock",
        purpose: "appointment_prepayment",
      }),
      updateIntentStatus: vi.fn(),
      findPaymentByIntent: vi.fn().mockResolvedValue(null),
      createPaymentFromIntent: vi.fn().mockResolvedValue({
        id: "payment-1",
        amountMinor: 300,
        currency: "RUB",
        providerId: "mock",
        status: "captured",
      }),
      appendHistoryEvent: vi.fn(),
      hasCapturedHistoryEvent: vi.fn().mockResolvedValue(false),
      setAppointmentPaymentRef: vi.fn(),
    };
    const bookingEngine = {
      getAppointment: vi.fn().mockResolvedValue({
        id: "appt-1",
        organizationId: "org-1",
        chainId: "chain-1",
        status: "awaiting_payment",
      }),
      listAppointmentsByChainId: vi.fn().mockResolvedValue([
        { id: "appt-1", status: "awaiting_payment" },
        { id: "appt-2", status: "awaiting_payment" },
      ]),
      transitionAppointmentStatus: vi.fn(),
    };
    const onAppointmentPaymentConfirmed = vi.fn();
    const svc = createPaymentsService({
      port: port as never,
      config: {
        getBookingPaymentSettings: async () => ({
          enabled: true,
          defaultProviderId: "mock",
          providers: [],
        }),
      },
      captureUnitOfWork,
      bookingEngine: bookingEngine as never,
      onAppointmentPaymentConfirmed,
    });

    await svc.captureIntentSuccess("intent-1", "org-1");

    expect(port.setAppointmentPaymentRef).toHaveBeenNthCalledWith(1, "appt-1", "payment-1", "org-1");
    expect(port.setAppointmentPaymentRef).toHaveBeenNthCalledWith(2, "appt-2", "payment-1", "org-1");
    expect(bookingEngine.transitionAppointmentStatus).toHaveBeenCalledTimes(4);
    expect(onAppointmentPaymentConfirmed).toHaveBeenCalledWith({
      appointmentId: "appt-1",
      paymentId: "payment-1",
      platformUserId: "user-1",
    });
    expect(onAppointmentPaymentConfirmed).toHaveBeenCalledWith({
      appointmentId: "appt-2",
      paymentId: "payment-1",
      platformUserId: "user-1",
    });
  });
});
