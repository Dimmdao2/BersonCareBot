import { describe, expect, it, vi } from "vitest";
import type { PaymentProviderPort } from "@/modules/payments/providerPort";
import type {
  SaasBillingInvoice,
  SaasBillingRepositoryPort,
} from "./ports";
import { createSaasBillingService } from "./service";

function draftSaasBillingInvoice(): SaasBillingInvoice {
  return {
    id: "invoice-1",
    organizationId: "org-1",
    saasBillingAccountId: "account-1",
    saasBillingSubscriptionId: "saas-billing-row-1",
    tariffId: "tariff-1",
    tariffName: "Team",
    amountMinor: 125_000,
    currency: "RUB",
    tariffBillingPeriod: "month",
    servicePeriodStartsAt: "2026-08-01T00:00:00.000Z",
    servicePeriodEndsAt: "2026-09-01T00:00:00.000Z",
    status: "draft",
    providerId: "mock",
    providerInvoiceRef: null,
    providerCheckoutUrl: null,
    providerIdempotencyKey: "renewal-1",
  };
}

describe("SaaS billing service", () => {
  it("persists an invoice before creating its provider intent and then attaches the result", async () => {
    const calls: string[] = [];
    const invoice = draftSaasBillingInvoice();
    const repository: SaasBillingRepositoryPort = {
      upsertManualSaasBillingSubscription: vi.fn(),
      createSaasBillingInvoice: vi.fn(async () => {
        calls.push("invoice");
        return invoice;
      }),
      attachSaasBillingInvoiceProviderIntent: vi.fn(async (input) => {
        calls.push("intent-attached");
        return {
          ...invoice,
          status: "pending" as const,
          providerInvoiceRef: input.providerInvoiceRef,
          providerCheckoutUrl: input.providerCheckoutUrl,
        };
      }),
      recordSaasBillingProviderEvent: vi.fn(),
    };
    const adapter: PaymentProviderPort = {
      createIntent: vi.fn(async () => {
        calls.push("provider");
        return { providerIntentRef: "mock-ref" };
      }),
      refund: vi.fn(),
      inspectWebhook: vi.fn(),
      verifyWebhook: vi.fn(),
    };
    const service = createSaasBillingService({
      repository,
      settings: {
        getSaasBillingPaymentProviderValue: vi.fn().mockResolvedValue(null),
      },
      resolvePaymentProvider: vi.fn().mockReturnValue(adapter),
    });

    await expect(service.createRenewalSaasBillingInvoice({
      organizationId: invoice.organizationId,
      saasBillingSubscriptionId: invoice.saasBillingSubscriptionId,
      servicePeriodStartsAt: invoice.servicePeriodStartsAt,
      servicePeriodEndsAt: invoice.servicePeriodEndsAt,
      providerIdempotencyKey: invoice.providerIdempotencyKey,
    })).resolves.toMatchObject({
      status: "pending",
      providerInvoiceRef: "mock-ref",
    });

    expect(calls).toEqual(["invoice", "provider", "intent-attached"]);
    expect(adapter.createIntent).toHaveBeenCalledWith(expect.objectContaining({
      amountMinor: 125_000,
      currency: "RUB",
      idempotencyKey: "renewal-1",
      metadata: {
        organizationId: "org-1",
        saasBillingInvoiceId: "invoice-1",
        saasBillingSubscriptionId: "saas-billing-row-1",
      },
    }));
  });

  it("lands repeated provider events idempotently through the repository port", async () => {
    const seen = new Set<string>();
    const recordSaasBillingProviderEvent = vi.fn(async (input) => {
      const key = `${input.providerId}:${input.providerEventId}`;
      if (seen.has(key)) return { created: false };
      seen.add(key);
      return { created: true };
    });
    const service = createSaasBillingService({
      repository: {
        upsertManualSaasBillingSubscription: vi.fn(),
        createSaasBillingInvoice: vi.fn(),
        attachSaasBillingInvoiceProviderIntent: vi.fn(),
        recordSaasBillingProviderEvent,
      },
      settings: { getSaasBillingPaymentProviderValue: vi.fn() },
      resolvePaymentProvider: vi.fn(),
    });
    const event = {
      organizationId: "org-1",
      saasBillingInvoiceId: "invoice-1",
      providerId: "mock",
      providerEventId: "event-1",
      eventType: "captured",
      rawPayload: { state: "captured" },
    };
    await expect(service.recordSaasBillingProviderEvent(event)).resolves.toEqual({ created: true });
    await expect(service.recordSaasBillingProviderEvent(event)).resolves.toEqual({ created: false });
  });
});
