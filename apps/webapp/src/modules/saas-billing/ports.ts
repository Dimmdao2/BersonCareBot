import type { PaymentProviderPort } from '@/modules/payments/providerPort';
import type { PaymentProviderConfig } from '@/modules/payments/types';
import type { OrgCommercialLifecycleState } from '@/modules/org-entitlements/types';
import type { SaasBillingPeriod } from './paidPeriod';

export type SaasBillingSource = 'manual' | 'paid_subscription';
export type SaasBillingSubscriptionStatus = 'pending_payment' | 'active' | 'expired' | 'cancelled';
export type SaasBillingInvoiceStatus = 'draft' | 'pending' | 'paid' | 'failed' | 'void';
/** К2 — `pending` until the provider webhook confirms it; `failed` frees the amount for a retry. */
export type SaasBillingRefundStatus = 'pending' | 'succeeded' | 'failed' | 'canceled';

export type SaasBillingSubscription = {
  id: string;
  organizationId: string;
  saasBillingAccountId: string;
  tariffId: string;
  source: SaasBillingSource;
  status: SaasBillingSubscriptionStatus;
  lifecycleState: OrgCommercialLifecycleState;
  providerId: string | null;
  savedPaymentMethodId: string | null;
  currentPeriodStartsAt: string | null;
  currentPeriodEndsAt: string | null;
  graceEndsAt: string | null;
  readOnlyEndsAt: string | null;
};

export type SaasBillingInvoice = {
  id: string;
  organizationId: string;
  saasBillingAccountId: string;
  saasBillingSubscriptionId: string;
  tariffId: string;
  tariffName: string;
  amountMinor: number;
  currency: string;
  tariffBillingPeriod: 'day' | 'month' | 'year';
  servicePeriodStartsAt: string;
  servicePeriodEndsAt: string;
  status: SaasBillingInvoiceStatus;
  providerId: string;
  providerInvoiceRef: string | null;
  providerCheckoutUrl: string | null;
  providerIdempotencyKey: string;
};

export type SaasBillingSubscriptionReadRow = SaasBillingSubscription & {
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SaasBillingInvoiceReadRow = SaasBillingInvoice & {
  paidAt: string | null;
  createdAt: string;
  updatedAt: string;
};

/** К2 — one refund attempt against a paid invoice. */
export type SaasBillingRefund = {
  id: string;
  organizationId: string;
  saasBillingInvoiceId: string;
  amountMinor: number;
  currency: string;
  status: SaasBillingRefundStatus;
  providerId: string;
  providerRefundRef: string | null;
  providerIdempotencyKey: string;
  confirmedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SaasBillingProviderEventReadRow = {
  id: string;
  organizationId: string;
  saasBillingInvoiceId: string | null;
  providerId: string;
  providerEventId: string;
  eventType: string;
  processedAt: string | null;
  createdAt: string;
};

export type SaasBillingOverview = {
  organizationId: string;
  subscriptions: SaasBillingSubscriptionReadRow[];
  invoices: SaasBillingInvoiceReadRow[];
  providerEvents: SaasBillingProviderEventReadRow[];
};

/**
 * К1 — one row of the platform's payments journal: how a clinic paid US for its tariff. Source is
 * our own `saas_billing_invoices` journal, never the provider — see `PAYMENTS_CABINET_PLAN.md` К1.
 */
export type SaasBillingPlatformInvoiceRow = SaasBillingInvoiceReadRow & {
  organizationId: string;
  organizationTitle: string;
  /** К2 — sum of `succeeded` refunds; confirmed money actually back with the clinic. */
  refundedMinor: number;
  /** К2 — sum of `pending` refunds; submitted to the provider but not yet confirmed. */
  pendingRefundMinor: number;
};

export type SaasBillingPlatformInvoiceFilter = {
  /** Inclusive lower bound on `createdAt` (the invoice/payment record's own date). */
  periodFrom?: string;
  /** Inclusive upper bound on `createdAt`. */
  periodTo?: string;
  status?: SaasBillingInvoiceStatus;
  /** Matched against the payer's (clinic's) organization title, case-insensitive substring. */
  payerSearch?: string;
};

/**
 * К3 — period+payer only, deliberately NOT status: the summary's whole point is to break the period
 * down BY status (`принято`/`возвращено`/`в обработке`/`не оплачено`), so it always covers the full
 * period the list filters show, regardless of which status the list itself is narrowed to. Grouped by
 * currency because `saas_billing_invoices.currency` is not constrained to one value; in practice
 * today there is exactly one group (RUB).
 */
export type SaasBillingPlatformSummaryFilter = {
  periodFrom?: string;
  periodTo?: string;
  payerSearch?: string;
};

export type SaasBillingPlatformSummaryBucket = { count: number; amountMinor: number };

export type SaasBillingPlatformCurrencySummary = {
  currency: string;
  /** `status = 'paid'`. */
  received: SaasBillingPlatformSummaryBucket;
  /** `succeeded` refunds against invoices in this period. */
  refunded: SaasBillingPlatformSummaryBucket;
  /** `status` in (`draft`, `pending`) — raised or sent to the provider, not yet resolved. */
  inProcess: SaasBillingPlatformSummaryBucket;
  /** `status` in (`failed`, `void`) — did not end in money received. */
  unpaid: SaasBillingPlatformSummaryBucket;
};

export type SaasBillingPlatformSummary = {
  byCurrency: SaasBillingPlatformCurrencySummary[];
};

/**
 * К3 item 2 — "вид покупки" for the platform surface is the tariff and its billing period (clinics
 * have no other kind of purchase). Built only from `paid` invoices: a purchase is something that
 * actually happened, not something pending or failed.
 */
export type SaasBillingPlatformBreakdownRow = {
  tariffId: string;
  tariffName: string;
  tariffBillingPeriod: 'day' | 'month' | 'year';
  currency: string;
  count: number;
  amountMinor: number;
};

export type SaasBillingReconciliationDiscrepancy =
  | {
      kind: 'missing_in_provider';
      saasBillingInvoiceId: string;
      organizationTitle: string;
      providerInvoiceRef: string;
      amountMinor: number;
      currency: string;
    }
  | {
      kind: 'missing_in_journal';
      providerPaymentRef: string;
      providerStatus: string;
      amountMinor: number;
      currency: string;
    }
  | {
      kind: 'amount_mismatch';
      saasBillingInvoiceId: string;
      organizationTitle: string;
      providerInvoiceRef: string;
      journalAmountMinor: number;
      journalCurrency: string;
      providerAmountMinor: number;
      providerCurrency: string;
    };

/**
 * К5 — one subscription whose paid period has ended and that renews itself (`source =
 * 'paid_subscription'`), returned by the ONE query allowed to see "which organizations are due"
 * (see `listSaasBillingSubscriptionsDueForRenewal`). Everything downstream acts on this row alone.
 */
export type SaasBillingSubscriptionDueForRenewal = {
  saasBillingSubscriptionId: string;
  organizationId: string;
  tariffId: string;
  billingPeriod: SaasBillingPeriod;
  /** The end of the period just paid — the new period's `servicePeriodStartsAt`, never `now()`. */
  currentPeriodEndsAt: string;
};

export type SaasBillingReconciliationResult =
  | { outcome: 'provider_unavailable'; providerId: string }
  | { outcome: 'provider_error'; providerId: string }
  | {
      outcome: 'ok';
      providerId: string;
      periodFrom: string;
      periodTo: string;
      checkedAt: string;
      journalCount: number;
      providerCount: number;
      /** The provider's own list was cut off by the page cap — discrepancies below may be incomplete. */
      truncated: boolean;
      discrepancies: SaasBillingReconciliationDiscrepancy[];
    };

export type SaasBillingProviderEventEnvelope = {
  providerId: string;
  providerEventId: string;
  type: string;
  status?: string | null;
  amountMinor?: number | null;
  currency?: string | null;
  invoiceReference?: string | null;
  subscriptionReference?: string | null;
  occurredAt?: string | null;
};

export type SaasBillingManualAssignmentState = {
  organization: {
    tariffId: string | null;
    commercialAccessState: string;
  };
  activeTrial:
    | (Record<string, unknown> & {
        id: string;
        organizationId: string;
        status: string;
      })
    | null;
  manualSaasBillingSubscription: {
    id: string;
    tariffId: string;
    status: SaasBillingSubscriptionStatus;
  } | null;
};

export type SaasBillingManualAssignmentTransactionPort = {
  loadManualAssignmentState(organizationId: string): Promise<SaasBillingManualAssignmentState>;
  /**
   * §5a item 7.0 — returns the owner's billing period, because the assignment is what starts the
   * organization's PAID PERIOD and the ladder now measures from its end.
   */
  requireActiveTariff(tariffId: string): Promise<{ billingPeriod: SaasBillingPeriod }>;
  setManualSaasBillingSubscription(input: {
    organizationId: string;
    tariffId: string | null;
    /** §5a item 7.0 — the paid period this assignment grants; `null` only when unassigning. */
    period: { startsAt: string; endsAt: string } | null;
  }): Promise<void>;
  updateCompatibilityProjection(input: {
    organizationId: string;
    tariffId: string | null;
  }): Promise<{ tariffId: string | null; commercialAccessState: string }>;
  endActiveTrial(trialId: string): Promise<unknown>;
  appendManualAssignmentAudit(input: {
    actorId: string | null;
    reason: string;
    action: string;
    targetId: string;
    organizationId: string;
    before: unknown;
    after: unknown;
  }): Promise<void>;
};

export type SaasBillingRepositoryPort = {
  getOrganizationBillingOverview(organizationId: string): Promise<SaasBillingOverview>;
  /** К1 — cross-org payments list for the platform cabinet. Never organization-scoped by design. */
  listPlatformInvoices(
    filter: SaasBillingPlatformInvoiceFilter,
  ): Promise<SaasBillingPlatformInvoiceRow[]>;
  /** К3 — period summary broken down by status; see {@link SaasBillingPlatformSummaryFilter}. */
  getPlatformPaymentsSummary(
    filter: SaasBillingPlatformSummaryFilter,
  ): Promise<SaasBillingPlatformSummary>;
  /** К3 — "разрез по видам покупок" (tariff × billing period), paid invoices only. */
  getPlatformPaymentsBreakdown(
    filter: SaasBillingPlatformSummaryFilter,
  ): Promise<SaasBillingPlatformBreakdownRow[]>;
  runManualAssignmentTransaction<T>(
    work: (transaction: SaasBillingManualAssignmentTransactionPort) => Promise<T>,
  ): Promise<T>;
  createSaasBillingInvoice(input: {
    organizationId: string;
    saasBillingSubscriptionId: string;
    providerId: string;
    providerIdempotencyKey: string;
    servicePeriodStartsAt: string;
    servicePeriodEndsAt: string;
  }): Promise<SaasBillingInvoice>;
  attachSaasBillingInvoiceProviderIntent(input: {
    saasBillingInvoiceId: string;
    providerInvoiceRef: string;
    providerCheckoutUrl: string | null;
  }): Promise<SaasBillingInvoice>;
  recordSaasBillingProviderEvent(input: {
    organizationId: string;
    saasBillingInvoiceId: string | null;
    event: SaasBillingProviderEventEnvelope;
  }): Promise<{ created: boolean }>;
  /** Unscoped lookup — the webhook does not know the organization until this resolves it. */
  findSaasBillingInvoiceByProviderRef(input: {
    providerId: string;
    providerInvoiceRef: string;
  }): Promise<SaasBillingInvoice | null>;
  markSaasBillingInvoicePaid(input: {
    saasBillingInvoiceId: string;
    organizationId: string;
    paidAt: string;
  }): Promise<SaasBillingInvoice>;
  /**
   * K0 — resolves the organization's OWN assigned tariff (the admin's choice, not a client input)
   * and ensures the `paid_subscription`-sourced subscription row for it exists, without touching the
   * `manual`-sourced row: the two live side by side under the `(organizationId, source)` unique key.
   * Throws `saas_billing_no_tariff_assigned` when the organization has no tariff to renew.
   */
  requireOwnTariffBillingSubscription(organizationId: string): Promise<{
    saasBillingSubscriptionId: string;
    tariffId: string;
    billingPeriod: SaasBillingPeriod;
  }>;
  /**
   * §5a item К0 — a captured payment extends the ONE subscription row the paid invoice was raised
   * against (identified by id, never by organization+source), so a `paid_subscription` capture can
   * never reach and silently overwrite a `manual` admin assignment.
   */
  activateSaasBillingSubscriptionPeriod(input: {
    organizationId: string;
    saasBillingSubscriptionId: string;
    periodStartsAt: string;
    periodEndsAt: string;
  }): Promise<void>;

  /**
   * К5 — the enumeration boundary: the only place cross-organization `saas_billing_subscriptions`
   * rows are selected for the renewal tick. Callers hand each returned row on to
   * {@link createSaasBillingRenewalInvoiceIfAbsent} one at a time; nothing downstream re-queries
   * "which subscriptions are due" itself.
   */
  listSaasBillingSubscriptionsDueForRenewal(input: {
    asOf: string;
    limit: number;
  }): Promise<SaasBillingSubscriptionDueForRenewal[]>;
  /**
   * К5 — idempotent by construction: `saas_billing_invoices_period_uidx` (unique on
   * `(saas_billing_subscription_id, service_period_starts_at, service_period_ends_at)`) makes a
   * second call for the same subscription+period a no-op that returns the invoice already raised
   * (`created: false`) instead of a duplicate row. Callers must skip the provider charge when
   * `created` is `false`.
   */
  createSaasBillingRenewalInvoiceIfAbsent(input: {
    organizationId: string;
    saasBillingSubscriptionId: string;
    providerId: string;
    providerIdempotencyKey: string;
    servicePeriodStartsAt: string;
    servicePeriodEndsAt: string;
  }): Promise<{ invoice: SaasBillingInvoice; created: boolean }>;

  /**
   * К2 — locks the invoice row, validates it, and either returns the refund already reserved
   * under this exact idempotency key (a repeated click) or inserts a new `pending` row plus its
   * audit entry, all inside one transaction. This is what makes "нажми возврат дважды" a no-op:
   * the second call finds the first call's row instead of racing it.
   */
  reserveSaasBillingRefund(input: {
    saasBillingInvoiceId: string;
    amountMinor: number;
    providerIdempotencyKey: string;
    audit: { actorId: string | null; reason: string };
  }): Promise<
    | { outcome: 'invoice_not_found' }
    | { outcome: 'invoice_not_refundable'; status: SaasBillingInvoiceStatus }
    | { outcome: 'amount_exceeds_remaining'; remainingMinor: number }
    | { outcome: 'duplicate'; refund: SaasBillingRefund }
    | { outcome: 'reserved'; refund: SaasBillingRefund; invoice: SaasBillingInvoice }
  >;
  /** Provider call answered synchronously — attach its ref; status stays `pending` until the webhook confirms it. */
  attachSaasBillingRefundProviderRef(input: {
    saasBillingRefundId: string;
    providerRefundRef: string;
  }): Promise<SaasBillingRefund>;
  /** The provider call itself failed (network/API error) — frees the amount for a fresh attempt. */
  markSaasBillingRefundFailed(input: { saasBillingRefundId: string }): Promise<SaasBillingRefund>;
  /** Unscoped lookup — the webhook does not know the organization until this resolves it. */
  findSaasBillingRefundByProviderRef(input: {
    providerId: string;
    providerRefundRef: string;
  }): Promise<SaasBillingRefund | null>;
  /** Org-scoped: call only after `findSaasBillingRefundByProviderRef` resolves the refund. */
  confirmSaasBillingRefund(input: {
    saasBillingRefundId: string;
    organizationId: string;
    status: 'succeeded' | 'canceled';
    confirmedAt: string;
  }): Promise<SaasBillingRefund>;
};

export type SaasBillingSettingsReadPort = {
  getSaasBillingPaymentProviderValue(): Promise<unknown>;
};

export type SaasBillingPaymentProviderResolver = (providerId: string) => PaymentProviderPort;

export type ResolvedSaasBillingPaymentProvider = {
  providerId: string;
  providerConfig: PaymentProviderConfig;
  adapter: PaymentProviderPort;
};
