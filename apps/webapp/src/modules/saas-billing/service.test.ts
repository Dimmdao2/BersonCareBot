import { describe, expect, it, vi } from "vitest";
import type { PaymentProviderPort } from "@/modules/payments/providerPort";
import type {
  SaasBillingInvoice,
  SaasBillingManualAssignmentTransactionPort,
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
  it("reads the requested organization billing overview through the repository port", async () => {
    const overview = {
      organizationId: "org-1",
      subscriptions: [],
      invoices: [],
      providerEvents: [],
    };
    const getOrganizationBillingOverview = vi.fn().mockResolvedValue(overview);
    const service = createSaasBillingService({
      repository: {
        getOrganizationBillingOverview,
        runManualAssignmentTransaction: vi.fn(),
        createSaasBillingInvoice: vi.fn(),
        attachSaasBillingInvoiceProviderIntent: vi.fn(),
        recordSaasBillingProviderEvent: vi.fn(),
      },
      settings: { getSaasBillingPaymentProviderValue: vi.fn() },
      resolvePaymentProvider: vi.fn(),
    });

    await expect(service.getOrganizationBillingOverview("org-1")).resolves.toBe(overview);
    expect(getOrganizationBillingOverview).toHaveBeenCalledWith("org-1");
  });

  it("persists an invoice before creating its provider intent and then attaches the result", async () => {
    const calls: string[] = [];
    const invoice = draftSaasBillingInvoice();
    const repository: SaasBillingRepositoryPort = {
      getOrganizationBillingOverview: vi.fn(),
      runManualAssignmentTransaction: vi.fn(),
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

  it("owns the manual trial-conversion transaction and writes exactly one audit record", async () => {
    const activeTrial = {
      id: "trial-1",
      organizationId: "org-1",
      status: "active",
    };
    const transaction: SaasBillingManualAssignmentTransactionPort = {
      loadManualAssignmentState: vi.fn().mockResolvedValue({
        organization: { tariffId: "trial-tariff", commercialAccessState: "active" },
        activeTrial,
        manualSaasBillingSubscription: null,
      }),
      requireActiveTariff: vi.fn().mockResolvedValue(undefined),
      setManualSaasBillingSubscription: vi.fn().mockResolvedValue(undefined),
      updateCompatibilityProjection: vi.fn().mockResolvedValue({
        tariffId: "manual-tariff",
        commercialAccessState: "active",
      }),
      endActiveTrial: vi.fn().mockResolvedValue({ ...activeTrial, status: "ended" }),
      appendManualAssignmentAudit: vi.fn().mockResolvedValue(undefined),
    };
    const runManualAssignmentTransaction = vi.fn();
    const repository: SaasBillingRepositoryPort = {
      getOrganizationBillingOverview: vi.fn(),
      async runManualAssignmentTransaction<T>(
        work: (value: SaasBillingManualAssignmentTransactionPort) => Promise<T>,
      ) {
        runManualAssignmentTransaction(work);
        return work(transaction);
      },
      createSaasBillingInvoice: vi.fn(),
      attachSaasBillingInvoiceProviderIntent: vi.fn(),
      recordSaasBillingProviderEvent: vi.fn(),
    };
    const service = createSaasBillingService({
      repository,
      settings: { getSaasBillingPaymentProviderValue: vi.fn() },
      resolvePaymentProvider: vi.fn(),
    });

    await service.assignManualTariff({
      organizationId: "org-1",
      tariffId: "manual-tariff",
      audit: { actorId: "actor-1", reason: "convert" },
    });

    expect(runManualAssignmentTransaction).toHaveBeenCalledOnce();
    expect(transaction.setManualSaasBillingSubscription).toHaveBeenCalledWith({
      organizationId: "org-1",
      tariffId: "manual-tariff",
    });
    expect(transaction.updateCompatibilityProjection).toHaveBeenCalledOnce();
    expect(transaction.endActiveTrial).toHaveBeenCalledWith("trial-1");
    expect(transaction.appendManualAssignmentAudit).toHaveBeenCalledOnce();
    expect(transaction.appendManualAssignmentAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "saas_trial_convert_to_manual_tariff",
        before: expect.objectContaining({ trial: activeTrial }),
        after: expect.objectContaining({
          trial: expect.objectContaining({ status: "ended" }),
        }),
      }),
    );
  });

  it("keeps a null manual assignment during an active trial as a no-op", async () => {
    const transaction: SaasBillingManualAssignmentTransactionPort = {
      loadManualAssignmentState: vi.fn().mockResolvedValue({
        organization: { tariffId: "trial-tariff", commercialAccessState: "active" },
        activeTrial: { id: "trial-1", organizationId: "org-1", status: "active" },
        manualSaasBillingSubscription: null,
      }),
      requireActiveTariff: vi.fn(),
      setManualSaasBillingSubscription: vi.fn(),
      updateCompatibilityProjection: vi.fn(),
      endActiveTrial: vi.fn(),
      appendManualAssignmentAudit: vi.fn(),
    };
    const repository: SaasBillingRepositoryPort = {
      getOrganizationBillingOverview: vi.fn(),
      runManualAssignmentTransaction: (work) => work(transaction),
      createSaasBillingInvoice: vi.fn(),
      attachSaasBillingInvoiceProviderIntent: vi.fn(),
      recordSaasBillingProviderEvent: vi.fn(),
    };
    const service = createSaasBillingService({
      repository,
      settings: { getSaasBillingPaymentProviderValue: vi.fn() },
      resolvePaymentProvider: vi.fn(),
    });

    await service.assignManualTariff({
      organizationId: "org-1",
      tariffId: null,
      audit: { actorId: null, reason: "unchanged" },
    });

    expect(transaction.setManualSaasBillingSubscription).not.toHaveBeenCalled();
    expect(transaction.updateCompatibilityProjection).not.toHaveBeenCalled();
    expect(transaction.endActiveTrial).not.toHaveBeenCalled();
    expect(transaction.appendManualAssignmentAudit).not.toHaveBeenCalled();
  });

  it("lands repeated provider events idempotently through the repository port", async () => {
    const seen = new Set<string>();
    const recordSaasBillingProviderEvent = vi.fn(async (input) => {
      const key = `${input.event.providerId}:${input.event.providerEventId}`;
      if (seen.has(key)) return { created: false };
      seen.add(key);
      return { created: true };
    });
    const service = createSaasBillingService({
      repository: {
        getOrganizationBillingOverview: vi.fn(),
        runManualAssignmentTransaction: vi.fn(),
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
      event: {
        providerId: "mock",
        providerEventId: "event-1",
        type: "captured",
        status: "captured",
      },
    };
    await expect(service.recordSaasBillingProviderEvent(event)).resolves.toEqual({ created: true });
    await expect(service.recordSaasBillingProviderEvent(event)).resolves.toEqual({ created: false });
  });
});
