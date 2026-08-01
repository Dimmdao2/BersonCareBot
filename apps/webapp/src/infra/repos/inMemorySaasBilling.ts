import type {
  SaasBillingInvoice,
  SaasBillingProviderEventReadRow,
  SaasBillingRepositoryPort,
  SaasBillingSubscription,
} from '@/modules/saas-billing/ports';

export function createInMemorySaasBillingRepository(): SaasBillingRepositoryPort {
  const rows = new Map<string, SaasBillingSubscription>();
  const organizationTariffs = new Map<string, string | null>();
  const invoices = new Map<string, SaasBillingInvoice>();
  const events = new Map<string, SaasBillingProviderEventReadRow>();

  return {
    async getOrganizationBillingOverview(organizationId) {
      const now = new Date().toISOString();
      return {
        organizationId,
        subscriptions: [...rows.values()]
          .filter((row) => row.organizationId === organizationId)
          .map((row) => ({
            ...row,
            cancelledAt: row.status === 'cancelled' ? now : null,
            createdAt: now,
            updatedAt: now,
          })),
        invoices: [...invoices.values()]
          .filter((row) => row.organizationId === organizationId)
          .map((row) => ({
            ...row,
            paidAt: row.status === 'paid' ? now : null,
            createdAt: now,
            updatedAt: now,
          })),
        providerEvents: [...events.values()].filter((row) => row.organizationId === organizationId),
      };
    },

    async runManualAssignmentTransaction(work) {
      return work({
        async loadManualAssignmentState(organizationId) {
          const manual = rows.get(organizationId) ?? null;
          return {
            organization: {
              tariffId: organizationTariffs.get(organizationId) ?? null,
              commercialAccessState: organizationTariffs.get(organizationId)
                ? 'active'
                : 'no_trial',
            },
            activeTrial: null,
            manualSaasBillingSubscription: manual
              ? { id: manual.id, tariffId: manual.tariffId, status: manual.status }
              : null,
          };
        },
        async requireActiveTariff() {
          return { billingPeriod: 'month' as const };
        },
        async setManualSaasBillingSubscription({ organizationId, tariffId, period }) {
          if (tariffId === null) {
            const current = rows.get(organizationId);
            if (current) {
              rows.set(organizationId, {
                ...current,
                status: 'cancelled',
                currentPeriodStartsAt: null,
                currentPeriodEndsAt: null,
              });
            }
            return;
          }
          const current = rows.get(organizationId);
          rows.set(organizationId, {
            id: current?.id ?? crypto.randomUUID(),
            organizationId,
            saasBillingAccountId: current?.saasBillingAccountId ?? crypto.randomUUID(),
            tariffId,
            source: 'manual',
            status: 'active',
            lifecycleState: 'active',
            providerId: null,
            savedPaymentMethodId: null,
            currentPeriodStartsAt: period?.startsAt ?? null,
            currentPeriodEndsAt: period?.endsAt ?? null,
            graceEndsAt: null,
            readOnlyEndsAt: null,
          });
        },
        async updateCompatibilityProjection({ organizationId, tariffId }) {
          organizationTariffs.set(organizationId, tariffId);
          return {
            tariffId,
            commercialAccessState: tariffId ? 'active' : 'no_trial',
          };
        },
        async endActiveTrial() {
          throw new Error('in_memory_saas_billing_trial_missing');
        },
        async appendManualAssignmentAudit() {},
      });
    },

    async createSaasBillingInvoice(input) {
      const authority = [...rows.values()].find(
        (row) =>
          row.id === input.saasBillingSubscriptionId && row.organizationId === input.organizationId,
      );
      if (!authority) throw new Error('saas_billing_subscription_not_found');
      const row: SaasBillingInvoice = {
        id: crypto.randomUUID(),
        organizationId: authority.organizationId,
        saasBillingAccountId: authority.saasBillingAccountId,
        saasBillingSubscriptionId: authority.id,
        tariffId: authority.tariffId,
        tariffName: 'In-memory tariff',
        amountMinor: 0,
        currency: 'RUB',
        tariffBillingPeriod: 'month',
        servicePeriodStartsAt: input.servicePeriodStartsAt,
        servicePeriodEndsAt: input.servicePeriodEndsAt,
        status: 'draft',
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
      if (!current) throw new Error('saas_billing_invoice_not_found');
      const row: SaasBillingInvoice = {
        ...current,
        providerInvoiceRef: input.providerInvoiceRef,
        providerCheckoutUrl: input.providerCheckoutUrl,
        status: 'pending',
      };
      invoices.set(row.id, row);
      return row;
    },

    async recordSaasBillingProviderEvent(input) {
      const key = `${input.event.providerId}:${input.event.providerEventId}`;
      if (events.has(key)) return { created: false };
      events.set(key, {
        id: crypto.randomUUID(),
        organizationId: input.organizationId,
        saasBillingInvoiceId: input.saasBillingInvoiceId,
        providerId: input.event.providerId,
        providerEventId: input.event.providerEventId,
        eventType: input.event.type,
        processedAt: null,
        createdAt: new Date().toISOString(),
      });
      return { created: true };
    },

    async findSaasBillingInvoiceByProviderRef({ providerId, providerInvoiceRef }) {
      const found = [...invoices.values()].find(
        (row) => row.providerId === providerId && row.providerInvoiceRef === providerInvoiceRef,
      );
      return found ?? null;
    },

    async markSaasBillingInvoicePaid({ saasBillingInvoiceId, organizationId }) {
      const current = invoices.get(saasBillingInvoiceId);
      if (!current || current.organizationId !== organizationId) {
        throw new Error('saas_billing_invoice_not_found');
      }
      const row: SaasBillingInvoice = { ...current, status: 'paid' };
      invoices.set(row.id, row);
      return row;
    },
  };
}
