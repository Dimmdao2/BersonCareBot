import type {
  SaasBillingInvoice,
  SaasBillingRepositoryPort,
  SaasBillingSubscription,
} from "@/modules/saas-billing/ports";

export function createInMemorySaasBillingRepository(): SaasBillingRepositoryPort {
  const rows = new Map<string, SaasBillingSubscription>();
  const organizationTariffs = new Map<string, string | null>();
  const invoices = new Map<string, SaasBillingInvoice>();
  const events = new Set<string>();

  return {
    async runManualAssignmentTransaction(work) {
      return work({
        async loadManualAssignmentState(organizationId) {
          const manual = rows.get(organizationId) ?? null;
          return {
            organization: {
              tariffId: organizationTariffs.get(organizationId) ?? null,
              commercialAccessState: organizationTariffs.get(organizationId)
                ? "active"
                : "no_trial",
            },
            activeTrial: null,
            manualSaasBillingSubscription: manual
              ? { id: manual.id, tariffId: manual.tariffId, status: manual.status }
              : null,
          };
        },
        async requireActiveTariff() {},
        async setManualSaasBillingSubscription({ organizationId, tariffId }) {
          if (tariffId === null) {
            const current = rows.get(organizationId);
            if (current) rows.set(organizationId, { ...current, status: "cancelled" });
            return;
          }
          const current = rows.get(organizationId);
          rows.set(organizationId, {
            id: current?.id ?? crypto.randomUUID(),
            organizationId,
            saasBillingAccountId: current?.saasBillingAccountId ?? crypto.randomUUID(),
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
          });
        },
        async updateCompatibilityProjection({ organizationId, tariffId }) {
          organizationTariffs.set(organizationId, tariffId);
          return {
            tariffId,
            commercialAccessState: tariffId ? "active" : "no_trial",
          };
        },
        async endActiveTrial() {
          throw new Error("in_memory_saas_billing_trial_missing");
        },
        async appendManualAssignmentAudit() {},
      });
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
      const key = `${input.event.providerId}:${input.event.providerEventId}`;
      if (events.has(key)) return { created: false };
      events.add(key);
      return { created: true };
    },
  };
}
