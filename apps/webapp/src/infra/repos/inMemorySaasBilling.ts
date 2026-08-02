import type {
  SaasBillingInvoice,
  SaasBillingPlatformCurrencySummary,
  SaasBillingProviderEventReadRow,
  SaasBillingRefund,
  SaasBillingRepositoryPort,
  SaasBillingSubscription,
} from '@/modules/saas-billing/ports';

const OPEN_REFUND_STATUSES: SaasBillingRefund['status'][] = ['pending', 'succeeded'];

/** Key = `${organizationId}::${source}` — mirrors the real `(organization_id, source)` unique index,
 *  so `manual` and `paid_subscription` rows for the same org never collide in this fake. */
function subscriptionKey(
  organizationId: string,
  source: SaasBillingSubscription['source'],
): string {
  return `${organizationId}::${source}`;
}

export function createInMemorySaasBillingRepository(): SaasBillingRepositoryPort {
  const rows = new Map<string, SaasBillingSubscription>();
  const organizationTariffs = new Map<string, string | null>();
  const invoices = new Map<string, SaasBillingInvoice>();
  const events = new Map<string, SaasBillingProviderEventReadRow>();
  const refunds = new Map<string, SaasBillingRefund>();

  /** К4 round 2 — same shared point as `insertSaasBillingInvoiceIdempotent` in the pg repository:
   *  a second call under the same `(providerId, providerIdempotencyKey)` returns the invoice
   *  already inserted instead of a duplicate row. */
  function insertInvoiceIdempotent(
    row: SaasBillingInvoice,
  ): { invoice: SaasBillingInvoice; created: boolean } {
    const existing = [...invoices.values()].find(
      (candidate) =>
        candidate.providerId === row.providerId &&
        candidate.providerIdempotencyKey === row.providerIdempotencyKey,
    );
    if (existing) return { invoice: existing, created: false };
    invoices.set(row.id, row);
    return { invoice: row, created: true };
  }

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

    async listActiveTariffChoices() {
      return [...new Set([...organizationTariffs.values()].filter((id): id is string => id !== null))]
        .sort()
        .map((id) => ({ id, name: 'In-memory tariff' }));
    },

    async listPlatformInvoices(filter) {
      const now = new Date().toISOString();
      return [...invoices.values()]
        .filter((row) => !filter.status || row.status === filter.status)
        .filter((row) => !filter.periodFrom || now >= filter.periodFrom)
        .filter((row) => !filter.periodTo || now <= filter.periodTo)
        .map((row) => ({
          ...row,
          paidAt: row.status === 'paid' ? now : null,
          createdAt: now,
          updatedAt: now,
          organizationId: row.organizationId,
          // No organization title source in this fake — the platform payments screen reads the
          // real (pg) repository; only the type shape needs satisfying here.
          organizationTitle: row.organizationId,
          refundedMinor: [...refunds.values()]
            .filter((r) => r.saasBillingInvoiceId === row.id && r.status === 'succeeded')
            .reduce((sum, r) => sum + r.amountMinor, 0),
          pendingRefundMinor: [...refunds.values()]
            .filter((r) => r.saasBillingInvoiceId === row.id && r.status === 'pending')
            .reduce((sum, r) => sum + r.amountMinor, 0),
        }));
    },

    async getPlatformPaymentsSummary(filter) {
      const zeroBucket = () => ({ count: 0, amountMinor: 0 });
      const byCurrency = new Map<string, SaasBillingPlatformCurrencySummary>();
      const inPeriod = (createdAt: string) =>
        (!filter.periodFrom || createdAt >= filter.periodFrom) &&
        (!filter.periodTo || createdAt <= filter.periodTo);
      for (const row of invoices.values()) {
        const now = new Date().toISOString();
        if (!inPeriod(now)) continue;
        const entry: SaasBillingPlatformCurrencySummary = byCurrency.get(row.currency) ?? {
          currency: row.currency,
          received: zeroBucket(),
          refunded: zeroBucket(),
          inProcess: zeroBucket(),
          unpaid: zeroBucket(),
        };
        if (row.status === 'paid') {
          entry.received.count += 1;
          entry.received.amountMinor += row.amountMinor;
        } else if (row.status === 'draft' || row.status === 'pending') {
          entry.inProcess.count += 1;
          entry.inProcess.amountMinor += row.amountMinor;
        } else {
          entry.unpaid.count += 1;
          entry.unpaid.amountMinor += row.amountMinor;
        }
        byCurrency.set(row.currency, entry);
      }
      for (const refund of refunds.values()) {
        if (refund.status !== 'succeeded') continue;
        const invoice = invoices.get(refund.saasBillingInvoiceId);
        if (!invoice) continue;
        const entry = byCurrency.get(invoice.currency);
        if (!entry) continue;
        entry.refunded.count += 1;
        entry.refunded.amountMinor += refund.amountMinor;
      }
      return { byCurrency: [...byCurrency.values()] };
    },

    async getPlatformPaymentsBreakdown(filter) {
      const inPeriod = (createdAt: string) =>
        (!filter.periodFrom || createdAt >= filter.periodFrom) &&
        (!filter.periodTo || createdAt <= filter.periodTo);
      const groups = new Map<
        string,
        {
          invoiceKind: SaasBillingInvoice['invoiceKind'];
          tariffId: string;
          tariffName: string;
          tariffBillingPeriod: 'day' | 'month' | 'year';
          currency: string;
          count: number;
          amountMinor: number;
        }
      >();
      for (const row of invoices.values()) {
        const now = new Date().toISOString();
        if (row.status !== 'paid' || !inPeriod(now)) continue;
        const key = `${row.invoiceKind}::${row.tariffId}::${row.tariffBillingPeriod}::${row.currency}`;
        const entry = groups.get(key) ?? {
          invoiceKind: row.invoiceKind,
          tariffId: row.tariffId,
          tariffName: row.tariffName,
          tariffBillingPeriod: row.tariffBillingPeriod,
          currency: row.currency,
          count: 0,
          amountMinor: 0,
        };
        entry.count += 1;
        entry.amountMinor += row.amountMinor;
        groups.set(key, entry);
      }
      return [...groups.values()];
    },

    async runManualAssignmentTransaction(work) {
      return work({
        async loadManualAssignmentState(organizationId) {
          const manual = rows.get(subscriptionKey(organizationId, 'paid_subscription')) ?? rows.get(subscriptionKey(organizationId, 'manual')) ?? null;
          return {
            organization: {
              tariffId: organizationTariffs.get(organizationId) ?? null,
            },
            activeTrial: null,
            manualSaasBillingSubscription: manual
              ? {
                  id: manual.id,
                  tariffId: manual.tariffId,
                  status: manual.status,
                  currentPeriodStartsAt: manual.currentPeriodStartsAt,
                  currentPeriodEndsAt: manual.currentPeriodEndsAt,
                  pendingTariffId: manual.pendingTariffId,
                }
              : null,
          };
        },
        async requireActiveTariff() {
          return { billingPeriod: 'month' as const };
        },
        async setManualSaasBillingSubscription({ organizationId, tariffId, period, pendingTariffId = null }) {
          const source = rows.has(subscriptionKey(organizationId, 'paid_subscription')) ? 'paid_subscription' : 'manual';
          const key = subscriptionKey(organizationId, source);
          if (tariffId === null) {
            const current = rows.get(key);
            if (current) {
              rows.set(key, {
                ...current,
                status: 'cancelled',
                currentPeriodStartsAt: null,
                currentPeriodEndsAt: null,
              });
            }
            return;
          }
          const current = rows.get(key);
          rows.set(key, {
            id: current?.id ?? crypto.randomUUID(),
            organizationId,
            saasBillingAccountId: current?.saasBillingAccountId ?? crypto.randomUUID(),
            tariffId,
            pendingTariffId,
            source,
            status: 'active',
            lifecycleState: 'active',
            providerId: null,
            savedPaymentMethodId: null,
            autopayConsentedAt: null,
            autopayConsentText: null,
            autopayRevokedAt: null,
            currentPeriodStartsAt: period?.startsAt ?? null,
            currentPeriodEndsAt: period?.endsAt ?? null,
            graceEndsAt: null,
            readOnlyEndsAt: null,
            paidAdditionalSeats: 0,
          });
        },
        async updateOrganizationTariffAssignment({ organizationId, tariffId }) {
          organizationTariffs.set(organizationId, tariffId);
          return { tariffId };
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
        tariffId: authority.pendingTariffId ?? authority.tariffId,
        tariffName: 'In-memory tariff',
        invoiceKind: 'tariff_period',
        additionalSeatQuantity: authority.paidAdditionalSeats,
        description: null,
        amountMinor: 0,
        currency: 'RUB',
        tariffBillingPeriod: 'month',
        tariffSnapshot: null,
        servicePeriodStartsAt: input.servicePeriodStartsAt,
        servicePeriodEndsAt: input.servicePeriodEndsAt,
        expiresAt: null,
        status: 'draft',
        providerId: input.providerId,
        providerInvoiceRef: null,
        providerCheckoutUrl: null,
        providerIdempotencyKey: input.providerIdempotencyKey,
      };
      return insertInvoiceIdempotent(row);
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

    async claimSaasBillingInvoiceProviderIntent(saasBillingInvoiceId) {
      const current = invoices.get(saasBillingInvoiceId);
      if (!current || current.status !== 'draft' || current.providerInvoiceRef !== null) return false;
      invoices.set(current.id, { ...current, status: 'pending' });
      return true;
    },

    async releaseSaasBillingInvoiceProviderIntent(saasBillingInvoiceId) {
      const current = invoices.get(saasBillingInvoiceId);
      if (current?.status === 'pending' && current.providerInvoiceRef === null) {
        invoices.set(current.id, { ...current, status: 'draft' });
      }
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

    async captureSaasBillingPaymentSucceeded(input) {
      const key = `${input.event.providerId}:${input.event.providerEventId}`;
      const existingEvent = events.get(key);
      const current = invoices.get(input.saasBillingInvoiceId);
      if (!current || current.organizationId !== input.organizationId) {
        return { captured: false, duplicate: Boolean(existingEvent) };
      }
      if (current.status === 'void' || current.status === 'failed') {
        return { captured: false, duplicate: Boolean(existingEvent) };
      }
      if (!existingEvent) {
        events.set(key, {
          id: crypto.randomUUID(), organizationId: input.organizationId,
          saasBillingInvoiceId: current.id, providerId: input.event.providerId,
          providerEventId: input.event.providerEventId, eventType: input.event.type,
          processedAt: new Date().toISOString(), createdAt: new Date().toISOString(),
        });
      }
      if (current.status !== 'paid') invoices.set(current.id, { ...current, status: 'paid' });
      const entry = [...rows.entries()].find(([, row]) => row.id === current.saasBillingSubscriptionId);
      if (!entry) throw new Error('saas_billing_subscription_not_found');
      const [subscriptionKeyValue, subscription] = entry;
      if (input.savedPaymentMethodId && current.invoiceKind === 'tariff_period') {
        rows.set(subscriptionKeyValue, { ...subscription, savedPaymentMethodId: input.savedPaymentMethodId });
      }
      if (current.invoiceKind === 'seat_overage' && current.status !== 'paid') {
        rows.set(subscriptionKeyValue, {
          ...subscription,
          paidAdditionalSeats: subscription.paidAdditionalSeats + current.additionalSeatQuantity,
        });
      }
      const due =
        current.invoiceKind === 'tariff_period' &&
        current.servicePeriodStartsAt <= input.paidAt &&
        (subscription.currentPeriodEndsAt === current.servicePeriodStartsAt ||
          (subscription.currentPeriodEndsAt === null &&
            current.tariffId === (subscription.pendingTariffId ?? subscription.tariffId)));
      if (due) {
        const latest = rows.get(subscriptionKeyValue) as SaasBillingSubscription;
        rows.set(subscriptionKeyValue, {
          ...latest, tariffId: current.tariffId, pendingTariffId: null, status: 'active',
          lifecycleState: 'active', currentPeriodStartsAt: current.servicePeriodStartsAt,
          currentPeriodEndsAt: current.servicePeriodEndsAt,
        });
        organizationTariffs.set(input.organizationId, current.tariffId);
      }
      return { captured: current.status !== 'paid', duplicate: Boolean(existingEvent) };
    },

    async findSaasBillingInvoiceByProviderRef({ providerId, providerInvoiceRef }) {
      const found = [...invoices.values()].find(
        (row) => row.providerId === providerId && row.providerInvoiceRef === providerInvoiceRef,
      );
      return found ?? null;
    },

    async createManualSaasBillingInvoice(input) {
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
        invoiceKind: input.invoiceKind,
        additionalSeatQuantity: input.additionalSeatQuantity,
        description: input.description,
        amountMinor: input.amountMinor,
        currency: input.currency,
        tariffBillingPeriod: 'month',
        tariffSnapshot: null,
        servicePeriodStartsAt: input.servicePeriodStartsAt,
        servicePeriodEndsAt: input.servicePeriodEndsAt,
        expiresAt: input.expiresAt,
        status: 'draft',
        providerId: input.providerId,
        providerInvoiceRef: null,
        providerCheckoutUrl: null,
        providerIdempotencyKey: input.providerIdempotencyKey,
      };
      return insertInvoiceIdempotent(row);
    },

    async createSeatOverageInvoiceIfNeeded(input) {
      const existing = [...invoices.values()].find(
        (row) =>
          row.providerId === input.providerId &&
          row.providerIdempotencyKey === input.providerIdempotencyKey,
      );
      if (existing) return { outcome: 'invoice' as const, invoice: existing, created: false };
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
        invoiceKind: 'seat_overage',
        additionalSeatQuantity: 1,
        description: 'Дополнительное место специалиста сверх тарифа',
        amountMinor: input.confirmedAmountMinor,
        currency: input.confirmedCurrency,
        tariffBillingPeriod: 'month',
        tariffSnapshot: null,
        servicePeriodStartsAt: input.servicePeriodStartsAt,
        servicePeriodEndsAt: input.servicePeriodEndsAt,
        expiresAt: input.servicePeriodEndsAt,
        status: 'draft',
        providerId: input.providerId,
        providerInvoiceRef: null,
        providerCheckoutUrl: null,
        providerIdempotencyKey: input.providerIdempotencyKey,
      };
      invoices.set(row.id, row);
      return { outcome: 'invoice' as const, invoice: row, created: true };
    },

    async cancelSaasBillingInvoice({ saasBillingInvoiceId }) {
      const current = invoices.get(saasBillingInvoiceId);
      if (!current) return { outcome: 'invoice_not_found' as const };
      if (current.status !== 'draft' && current.status !== 'pending') {
        return { outcome: 'invoice_not_cancellable' as const, status: current.status };
      }
      const row: SaasBillingInvoice = { ...current, status: 'void' };
      invoices.set(row.id, row);
      return { outcome: 'cancelled' as const, invoice: row };
    },

    async requireOwnTariffBillingSubscription(organizationId) {
      const tariffId = organizationTariffs.get(organizationId) ?? null;
      if (!tariffId) throw new Error('saas_billing_no_tariff_assigned');
      const key = subscriptionKey(organizationId, 'paid_subscription');
      const current = rows.get(key);
      const row: SaasBillingSubscription = {
        id: current?.id ?? crypto.randomUUID(),
        organizationId,
        saasBillingAccountId: current?.saasBillingAccountId ?? crypto.randomUUID(),
        tariffId,
        pendingTariffId: current?.pendingTariffId ?? null,
        source: 'paid_subscription',
        status: current?.status ?? 'pending_payment',
        lifecycleState: current?.lifecycleState ?? 'active',
        providerId: current?.providerId ?? null,
        savedPaymentMethodId: current?.savedPaymentMethodId ?? null,
        autopayConsentedAt: current?.autopayConsentedAt ?? null,
        autopayConsentText: current?.autopayConsentText ?? null,
        autopayRevokedAt: current?.autopayRevokedAt ?? null,
        currentPeriodStartsAt: current?.currentPeriodStartsAt ?? null,
        currentPeriodEndsAt: current?.currentPeriodEndsAt ?? null,
        graceEndsAt: current?.graceEndsAt ?? null,
        readOnlyEndsAt: current?.readOnlyEndsAt ?? null,
        paidAdditionalSeats: current?.paidAdditionalSeats ?? 0,
      };
      rows.set(key, row);
      return {
        saasBillingSubscriptionId: row.id,
        currentTariffId: row.tariffId,
        tariffId,
          billingPeriod: 'month' as const,
          savedPaymentMethodId: row.savedPaymentMethodId,
          additionalSeatPriceMinor: null,
          currency: 'RUB',
          currentPeriodEndsAt: row.currentPeriodEndsAt,
      };
    },

    async listSaasBillingSubscriptionsDueForRenewal({ asOf, limit }) {
      return [...rows.values()]
        .filter(
          (row) =>
            row.source === 'paid_subscription' &&
            row.status === 'active' &&
            row.currentPeriodEndsAt !== null &&
            row.currentPeriodEndsAt <= asOf,
        )
        .slice(0, limit)
        .map((row) => ({
          saasBillingSubscriptionId: row.id,
          organizationId: row.organizationId,
          tariffId: row.tariffId,
          pendingTariffId: row.pendingTariffId,
          // No tariff-detail store in this fake (see `createSaasBillingInvoice` above) — the real
          // (pg) repository is what the renewal tick actually runs against.
          billingPeriod: 'month' as const,
          currentPeriodEndsAt: row.currentPeriodEndsAt as string,
          savedPaymentMethodId: row.savedPaymentMethodId,
          autopayConsentedAt: row.autopayConsentedAt,
          autopayRevokedAt: row.autopayRevokedAt,
        }));
    },

    async createSaasBillingRenewalInvoiceIfAbsent(input) {
      const existing = [...invoices.values()].find(
        (row) =>
          row.saasBillingSubscriptionId === input.saasBillingSubscriptionId &&
          row.servicePeriodStartsAt === input.servicePeriodStartsAt &&
          row.servicePeriodEndsAt === input.servicePeriodEndsAt,
      );
      if (existing) return { invoice: existing, created: false };

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
        tariffId: authority.pendingTariffId ?? authority.tariffId,
        tariffName: 'In-memory tariff',
        invoiceKind: 'tariff_period',
        additionalSeatQuantity: authority.paidAdditionalSeats,
        description: null,
        amountMinor: 0,
        currency: 'RUB',
        tariffBillingPeriod: 'month',
        tariffSnapshot: null,
        servicePeriodStartsAt: input.servicePeriodStartsAt,
        servicePeriodEndsAt: input.servicePeriodEndsAt,
        expiresAt: null,
        status: 'draft',
        providerId: input.providerId,
        providerInvoiceRef: null,
        providerCheckoutUrl: null,
        providerIdempotencyKey: input.providerIdempotencyKey,
      };
      invoices.set(row.id, row);
      return { invoice: row, created: true };
    },

    async promoteDueSaasBillingPaidInvoice({ organizationId, saasBillingSubscriptionId, asOf }) {
      const entry = [...rows.entries()].find(([, row]) => row.id === saasBillingSubscriptionId);
      if (!entry) throw new Error('saas_billing_subscription_not_found');
      const [key, subscription] = entry;
      const candidate = [...invoices.values()].find(
        (row) => row.organizationId === organizationId && row.saasBillingSubscriptionId === saasBillingSubscriptionId &&
          row.invoiceKind === 'tariff_period' && row.status === 'paid' &&
          row.servicePeriodStartsAt === subscription.currentPeriodEndsAt && row.servicePeriodStartsAt <= asOf,
      );
      if (!candidate) return false;
      rows.set(key, {
        ...subscription, tariffId: candidate.tariffId, pendingTariffId: null, status: 'active',
        lifecycleState: 'active', currentPeriodStartsAt: candidate.servicePeriodStartsAt,
        currentPeriodEndsAt: candidate.servicePeriodEndsAt,
      });
      organizationTariffs.set(organizationId, candidate.tariffId);
      return true;
    },

    async reserveSaasBillingRefund({ saasBillingInvoiceId, amountMinor, providerIdempotencyKey }) {
      const invoice = invoices.get(saasBillingInvoiceId);
      if (!invoice) return { outcome: 'invoice_not_found' as const };
      if (invoice.status !== 'paid') {
        return { outcome: 'invoice_not_refundable' as const, status: invoice.status };
      }
      if (invoice.invoiceKind === 'seat_overage' && amountMinor !== invoice.amountMinor) {
        return { outcome: 'seat_overage_partial_refund_forbidden' as const };
      }
      const refundedMinor = [...refunds.values()]
        .filter(
          (r) =>
            r.saasBillingInvoiceId === saasBillingInvoiceId &&
            OPEN_REFUND_STATUSES.includes(r.status),
        )
        .reduce((sum, r) => sum + r.amountMinor, 0);
      const remainingMinor = invoice.amountMinor - refundedMinor;
      if (amountMinor > remainingMinor) {
        return { outcome: 'amount_exceeds_remaining' as const, remainingMinor };
      }
      const existing = [...refunds.values()].find(
        (r) =>
          r.providerId === invoice.providerId &&
          r.providerIdempotencyKey === providerIdempotencyKey,
      );
      if (existing) return { outcome: 'duplicate' as const, refund: existing };

      const now = new Date().toISOString();
      const refund: SaasBillingRefund = {
        id: crypto.randomUUID(),
        organizationId: invoice.organizationId,
        saasBillingInvoiceId,
        amountMinor,
        currency: invoice.currency,
        status: 'pending',
        providerId: invoice.providerId,
        providerRefundRef: null,
        providerIdempotencyKey,
        confirmedAt: null,
        createdAt: now,
        updatedAt: now,
      };
      refunds.set(refund.id, refund);
      return { outcome: 'reserved' as const, refund, invoice };
    },

    async attachSaasBillingRefundProviderRef({ saasBillingRefundId, providerRefundRef }) {
      const current = refunds.get(saasBillingRefundId);
      if (!current) throw new Error('saas_billing_refund_not_found');
      const refund: SaasBillingRefund = { ...current, providerRefundRef };
      refunds.set(refund.id, refund);
      return refund;
    },

    async markSaasBillingRefundFailed({ saasBillingRefundId }) {
      const current = refunds.get(saasBillingRefundId);
      if (!current) throw new Error('saas_billing_refund_not_found');
      const refund: SaasBillingRefund = { ...current, status: 'failed' };
      refunds.set(refund.id, refund);
      return refund;
    },

    async findSaasBillingRefundByProviderRef({ providerId, providerRefundRef }) {
      const found = [...refunds.values()].find(
        (r) => r.providerId === providerId && r.providerRefundRef === providerRefundRef,
      );
      return found ?? null;
    },

    async confirmSaasBillingRefund({ saasBillingRefundId, organizationId, status, confirmedAt }) {
      const current = refunds.get(saasBillingRefundId);
      if (!current || current.organizationId !== organizationId) {
        throw new Error('saas_billing_refund_not_found');
      }
      if (current.status !== 'pending') return current;
      const refund: SaasBillingRefund = { ...current, status, confirmedAt };
      refunds.set(refund.id, refund);
      const invoice = invoices.get(refund.saasBillingInvoiceId);
      if (status === 'succeeded' && invoice?.invoiceKind === 'seat_overage') {
        const entry = [...rows.entries()].find(([, row]) => row.id === invoice.saasBillingSubscriptionId);
        if (entry) {
          const [key, subscription] = entry;
          rows.set(key, {
            ...subscription,
            paidAdditionalSeats: Math.max(
              subscription.paidAdditionalSeats - invoice.additionalSeatQuantity,
              0,
            ),
          });
        }
      }
      return refund;
    },

    async grantSaasBillingAutopayConsent({ organizationId, consentText, consentedAt }) {
      const key = subscriptionKey(organizationId, 'paid_subscription');
      const current = rows.get(key);
      if (!current) return { outcome: 'no_subscription' as const };
      rows.set(key, {
        ...current,
        autopayConsentedAt: consentedAt,
        autopayConsentText: consentText,
        autopayRevokedAt: null,
      });
      return { outcome: 'granted' as const };
    },

    async revokeSaasBillingAutopayConsent({ organizationId, revokedAt }) {
      const key = subscriptionKey(organizationId, 'paid_subscription');
      const current = rows.get(key);
      if (!current) return { outcome: 'no_subscription' as const };
      rows.set(key, { ...current, autopayRevokedAt: revokedAt });
      return { outcome: 'revoked' as const };
    },

    async saveSaasBillingSubscriptionPaymentMethod({
      saasBillingSubscriptionId,
      organizationId,
      savedPaymentMethodId,
    }) {
      const entry = [...rows.entries()].find(
        ([, row]) => row.id === saasBillingSubscriptionId && row.organizationId === organizationId,
      );
      if (!entry) throw new Error('saas_billing_subscription_not_found');
      const [key, current] = entry;
      rows.set(key, { ...current, savedPaymentMethodId });
    },

    async markSaasBillingInvoiceFailed({ saasBillingInvoiceId, organizationId }) {
      const current = invoices.get(saasBillingInvoiceId);
      if (
        !current ||
        current.organizationId !== organizationId ||
        (current.status !== 'draft' && current.status !== 'pending')
      ) {
        return null;
      }
      const row: SaasBillingInvoice = { ...current, status: 'failed' };
      invoices.set(row.id, row);
      return row;
    },
  };
}
