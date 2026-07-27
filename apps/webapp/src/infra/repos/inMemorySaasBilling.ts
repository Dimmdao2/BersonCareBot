import type {
  SaasBillingInvoice,
  SaasBillingRepositoryPort,
  SaasBillingSubscription,
} from "@/modules/saas-billing/ports";

export function createInMemorySaasBillingRepository(): SaasBillingRepositoryPort {
  const rows = new Map<string, SaasBillingSubscription>();
  const invoices = new Map<string, SaasBillingInvoice>();
  const events = new Set<string>();

  return {
    async upsertManualSaasBillingSubscription({ organizationId, tariffId }) {
      if (tariffId === null) {
        rows.delete(organizationId);
        return null;
      }
      const row: SaasBillingSubscription = {
        id: rows.get(organizationId)?.id ?? crypto.randomUUID(),
        organizationId,
        saasBillingAccountId:
          rows.get(organizationId)?.saasBillingAccountId ?? crypto.randomUUID(),
        tariffId,
        source: "manual",
        status: "active",
        lifecycleState: "active",
        providerId: null,
        savedPaymentMethodId: null,
        currentPeriodStartsAt: null,
        currentPeriodEndsAt: null,
        graceEndsAt: null,
        readOnlyEndsAt: null,
      };
      rows.set(organizationId, row);
      return row;
    },

    async createSaasBillingInvoice(input) {
      const authority = [...rows.values()].find(
        (row) =>
          row.id === input.saasBillingSubscriptionId &&
          row.organizationId === input.organizationId,
      );
      if (!authority) throw new Error("saas_billing_subscription_not_found");
      const row: SaasBillingInvoice = {
        id: crypto.randomUUID(),
        organizationId: authority.organizationId,
        saasBillingAccountId: authority.saasBillingAccountId,
        saasBillingSubscriptionId: authority.id,
        tariffId: authority.tariffId,
        tariffName: "In-memory tariff",
        amountMinor: 0,
        currency: "RUB",
        tariffBillingPeriod: "month",
        servicePeriodStartsAt: input.servicePeriodStartsAt,
        servicePeriodEndsAt: input.servicePeriodEndsAt,
        status: "draft",
        providerId: input.providerId,
        providerInvoiceRef: null,
        providerCheckoutUrl: null,
        providerIdempotencyKey: input.providerIdempotencyKey,
      };
      invoices.set(row.id, row);
      return row;
    },

    async attachSaasBillingInvoiceProviderIntent(input) {
      const current = invoices.get(input.saasBillingInvoiceId);
      if (!current) throw new Error("saas_billing_invoice_not_found");
      const row: SaasBillingInvoice = {
        ...current,
        providerInvoiceRef: input.providerInvoiceRef,
        providerCheckoutUrl: input.providerCheckoutUrl,
        status: "pending",
      };
      invoices.set(row.id, row);
      return row;
    },

    async recordSaasBillingProviderEvent(input) {
      const key = `${input.providerId}:${input.providerEventId}`;
      if (events.has(key)) return { created: false };
      events.add(key);
      return { created: true };
    },
  };
}
