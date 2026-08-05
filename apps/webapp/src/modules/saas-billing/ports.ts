import type { PaymentProviderPort, PaymentReceipt } from '@/modules/payments/providerPort';
import type { PaymentProviderConfig } from '@/modules/payments/types';
import type { OrgCommercialLifecycleState } from '@/modules/org-entitlements/types';
import type { SaasBillingPeriod } from './paidPeriod';

export type SaasBillingSource = 'manual' | 'paid_subscription';
export type SaasBillingSubscriptionStatus = 'pending_payment' | 'active' | 'expired' | 'cancelled';
export type SaasBillingInvoiceStatus = 'draft' | 'pending' | 'paid' | 'failed' | 'void';
export type SaasBillingInvoiceKind = 'tariff_period' | 'seat_overage';
/** Existing `tariff_period` rows that are a paid-period upgrade use this visible, durable description. */
export const SAAS_BILLING_TARIFF_UPGRADE_DESCRIPTION = 'Доплата за повышение тарифа';
/** К2 — `pending` until the provider webhook confirms it; `failed` frees the amount for a retry. */
export type SaasBillingRefundStatus = 'pending' | 'succeeded' | 'failed' | 'canceled';

export type SaasBillingSubscription = {
  id: string;
  organizationId: string;
  saasBillingAccountId: string;
  tariffId: string;
  pendingTariffId: string | null;
  source: SaasBillingSource;
  status: SaasBillingSubscriptionStatus;
  lifecycleState: OrgCommercialLifecycleState;
  providerId: string | null;
  savedPaymentMethodId: string | null;
  /** К6 — date + exact text the payer saw; `null` unless consent was ever granted. See `SaasBillingSubscriptions` schema doc. */
  autopayConsentedAt: string | null;
  autopayConsentText: string | null;
  /** К6 — set on revoke; cleared back to `null` on a fresh grant. Active consent = consentedAt set AND this null. */
  autopayRevokedAt: string | null;
  currentPeriodStartsAt: string | null;
  currentPeriodEndsAt: string | null;
  graceEndsAt: string | null;
  readOnlyEndsAt: string | null;
  /** Immutable current paid-period tariff snapshot; null only when no paid period exists. */
  tariffSnapshot: Record<string, unknown> | null;
  paidAdditionalSeats: number;
};

export type SaasBillingInvoice = {
  id: string;
  organizationId: string;
  saasBillingAccountId: string;
  saasBillingSubscriptionId: string;
  tariffId: string;
  tariffName: string;
  invoiceKind: SaasBillingInvoiceKind;
  additionalSeatQuantity: number;
  /** К4 — admin-entered "за что" for a manual invoice; `null` for auto/renewal invoices. */
  description: string | null;
  amountMinor: number;
  currency: string;
  tariffBillingPeriod: 'day' | 'month' | 'year';
  tariffSnapshot: Record<string, unknown> | null;
  servicePeriodStartsAt: string;
  servicePeriodEndsAt: string;
  /** К4 — the invoice's own payment deadline; `null` for auto/renewal invoices, which never expire. */
  expiresAt: string | null;
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
  billingEmail: string | null;
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
 * К3 item 2 — paid money split by invoice purpose, tariff and billing period. Draft/pending/failed
 * invoices are not purchases and therefore do not enter this breakdown.
 */
export type SaasBillingPlatformBreakdownRow = {
  invoiceKind: SaasBillingInvoiceKind;
  tariffId: string;
  tariffName: string;
  tariffBillingPeriod: 'day' | 'month' | 'year';
  currency: string;
  count: number;
  amountMinor: number;
};

export type SaasBillingSeatOverageInvoiceResult =
  | { outcome: 'seat_available' }
  | { outcome: 'seat_overage_unavailable' }
  | { outcome: 'price_changed'; priceMinor: number; currency: string }
  | { outcome: 'invoice'; invoice: SaasBillingInvoice; created: boolean };

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
  pendingTariffId: string | null;
  billingPeriod: SaasBillingPeriod;
  /** The end of the period just paid — the new period's `servicePeriodStartsAt`, never `now()`. */
  currentPeriodEndsAt: string;
  /** К6 — off-session charge target; `null` until a `payment.succeeded` webhook reports one. */
  savedPaymentMethodId: string | null;
  autopayConsentedAt: string | null;
  autopayRevokedAt: string | null;
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
  };
  /** True once any `saas_organization_trials` row exists — the trial is one-time per org (T5). */
  organizationTrialConsumed: boolean;
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
    currentPeriodStartsAt: string | null;
    currentPeriodEndsAt: string | null;
    pendingTariffId: string | null;
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
    pendingTariffId?: string | null;
    /** Scheduling/cancelling must not replace the snapshot frozen for the current paid period. */
    preservePeriodSnapshot?: boolean;
  }): Promise<void>;
  updateOrganizationTariffAssignment(input: {
    organizationId: string;
    tariffId: string | null;
  }): Promise<{ tariffId: string | null }>;
  getActiveTrialPolicy(): Promise<{
    durationDays: number;
    discountWindowDays: number;
    postTrialBehavior: string;
    postTrialTariffId: string | null;
  } | null>;
  startOrganizationTrial(input: {
    organizationId: string;
    tariffId: string;
    policy: {
      durationDays: number;
      discountWindowDays: number;
      postTrialBehavior: string;
      postTrialTariffId: string | null;
    };
    audit: { actorId: string | null; reason: string };
  }): Promise<{ created: boolean; endsAt: string }>;
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
  /** Billing-account contact is the payer email sent to the fiscal receipt. */
  getSaasBillingAccountBillingEmail(organizationId: string): Promise<string | null>;
  updateSaasBillingAccountBillingEmail(input: {
    organizationId: string;
    billingEmail: string;
  }): Promise<string>;
  getOrganizationBillingOverview(organizationId: string): Promise<SaasBillingOverview>;
  /** The organization's own `be_organizations.tariff_id`, not a billing-subscription mirror. */
  getOrganizationAssignedTariffId(organizationId: string): Promise<string | null>;
  /**
   * #1069 T5 — clinic owner's first tariff choice when registration tariff policy was empty.
   * Runs through `app.choose_organization_first_tariff` under the clinic-billing principal.
   */
  chooseOrganizationFirstTariff(input: {
    organizationId: string;
    tariffId: string;
    actorId: string | null;
  }): Promise<
    | { outcome: 'trial_started'; endsAt: string }
    | { outcome: 'payment_required' }
  >;
  /** Active public tariff names available to the caller's own clinic billing screen. */
  listActiveTariffChoices(): Promise<Array<{ id: string; name: string }>>;
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
  /**
   * К4 round 2 — idempotent by construction, same shape as
   * {@link createSaasBillingRenewalInvoiceIfAbsent}: a second call under the same
   * `(providerId, providerIdempotencyKey)` returns the invoice already raised (`created: false`)
   * instead of a duplicate row. For the tariff-renewal-only caller, an older empty draft with the
   * same subscription period is also returned before inserting, preserving its provider key. A
   * draft still needs to be claimed before its first or retried provider call; see
   * `claimSaasBillingInvoiceProviderIntent`.
   */
  createSaasBillingInvoice(input: {
    organizationId: string;
    saasBillingSubscriptionId: string;
    providerId: string;
    providerIdempotencyKey: string;
    servicePeriodStartsAt: string;
    servicePeriodEndsAt: string;
  }): Promise<{ invoice: SaasBillingInvoice; created: boolean }>;
  /**
   * Locks the current paid subscription, derives both tariff prices and the exact remaining time,
   * then creates at most one checkout invoice for its immediate upgrade.
   */
  createProratedTariffUpgradeInvoice(input: {
    organizationId: string;
    saasBillingSubscriptionId: string;
    targetTariffId: string;
    asOf: string;
    providerId: string;
    providerIdempotencyKey: string;
  }): Promise<
    | { outcome: 'checkout'; invoice: SaasBillingInvoice; created: boolean }
    | { outcome: 'scheduled' }
  >;
  attachSaasBillingInvoiceProviderIntent(input: {
    saasBillingInvoiceId: string;
    providerInvoiceRef: string;
    providerCheckoutUrl: string | null;
  }): Promise<SaasBillingInvoice>;
  /** Existing invoice JSON snapshot keeps fiscal refund data without a second settings entity. */
  attachSaasBillingInvoiceReceiptSnapshot(input: {
    saasBillingInvoiceId: string;
    receipt: PaymentReceipt;
  }): Promise<SaasBillingInvoice>;
  /** Atomically reserves a draft for one provider call. A false result means another call owns it. */
  claimSaasBillingInvoiceProviderIntent(saasBillingInvoiceId: string): Promise<boolean>;
  /**
   * Releases an unlinked reservation after the provider call fails, making the same key retryable.
   *
   * B0.3 — pass `rotateProviderIdempotencyKeyTo` only when the adapter proved the PSP refused the
   * request before creating anything (`PaymentProviderRequestRefusedError`): the release then also
   * rotates `providerIdempotencyKey` to that value in the same write, so the next attempt is not
   * resending a key the PSP already burned. Omitted for an ambiguous failure — the key must stay,
   * so a retry idempotently replays instead of risking a double charge.
   */
  releaseSaasBillingInvoiceProviderIntent(input: {
    saasBillingInvoiceId: string;
    rotateProviderIdempotencyKeyTo?: string;
  }): Promise<void>;
  recordSaasBillingProviderEvent(input: {
    organizationId: string;
    saasBillingInvoiceId: string | null;
    event: SaasBillingProviderEventEnvelope;
  }): Promise<{ created: boolean }>;
  /** One durable success action: event, invoice CAS/replay, saved method and (when due) period promotion. */
  captureSaasBillingPaymentSucceeded(input: {
    organizationId: string;
    saasBillingInvoiceId: string;
    paidAt: string;
    event: SaasBillingProviderEventEnvelope;
    savedPaymentMethodId: string | null;
  }): Promise<{ captured: boolean; duplicate: boolean }>;
  /**
   * Unscoped lookup — the webhook does not know the organization until this resolves it. Runs
   * under the bootstrap principal (organization not yet known), so the implementation reads
   * through a narrow SECURITY DEFINER resolver rather than the plain table — only the fields the
   * webhook actually needs to check are returned, never the full invoice row.
   */
  findSaasBillingInvoiceByProviderRef(input: {
    providerId: string;
    providerInvoiceRef: string;
  }): Promise<Pick<SaasBillingInvoice, 'id' | 'organizationId' | 'amountMinor' | 'currency'> | null>;
  /**
   * К4 — a platform-admin-issued invoice for the organization's OWN currently assigned tariff
   * (same subscription row `requireOwnTariffBillingSubscription` resolves), with an admin-chosen
   * amount/description/expiry instead of the tariff's list price. `tariffName`/`tariffBillingPeriod`
   * are still derived from the live tariff row, same as `createSaasBillingInvoice`.
   *
   * К4 round 2 — idempotent by construction, same shape as `createSaasBillingInvoice`: a second
   * call under the same `(providerId, providerIdempotencyKey)` returns the invoice already raised
   * (`created: false`) instead of a duplicate row.
   */
  createManualSaasBillingInvoice(input: {
    organizationId: string;
    saasBillingSubscriptionId: string;
    amountMinor: number;
    currency: string;
    description: string;
    servicePeriodStartsAt: string;
    servicePeriodEndsAt: string;
    expiresAt: string;
    providerId: string;
    providerIdempotencyKey: string;
    invoiceKind: SaasBillingInvoiceKind;
    additionalSeatQuantity: number;
  }): Promise<{ invoice: SaasBillingInvoice; created: boolean }>;

  /**
   * Re-checks current usage, effective included/override capacity, paid allowance and effective
   * unit price under the clinic billing principal while holding the same organization lock as
   * invite creation. A same-key draft is returned before the capacity check so a failed PSP call
   * remains retryable with the original provider idempotency key.
   */
  createSeatOverageInvoiceIfNeeded(input: {
    organizationId: string;
    saasBillingSubscriptionId: string;
    confirmedAmountMinor: number;
    confirmedCurrency: string;
    providerId: string;
    providerIdempotencyKey: string;
    servicePeriodStartsAt: string;
    servicePeriodEndsAt: string;
  }): Promise<SaasBillingSeatOverageInvoiceResult>;
  /**
   * К4 — platform-wide by design, same as the refund reservation this mirrors: looked up by
   * invoice id alone, not organization-scoped (see `reserveSaasBillingRefund`). Only `draft`/
   * `pending` invoices can be cancelled — an already-`paid` invoice cannot, and a `void` one is
   * already cancelled, not re-cancellable.
   */
  cancelSaasBillingInvoice(input: {
    saasBillingInvoiceId: string;
    actorId: string | null;
    reason: string;
  }): Promise<
    | { outcome: 'invoice_not_found' }
    | { outcome: 'invoice_not_cancellable'; status: SaasBillingInvoiceStatus }
    | { outcome: 'cancelled'; invoice: SaasBillingInvoice }
  >;
  /**
   * K0 — resolves the organization's OWN assigned tariff (the admin's choice, not a client input)
   * and ensures the `paid_subscription`-sourced subscription row for it exists, without touching the
   * `manual`-sourced row: the two live side by side under the `(organizationId, source)` unique key.
   * Throws `saas_billing_no_tariff_assigned` when the organization has no tariff to renew.
   */
  requireOwnTariffBillingSubscription(organizationId: string): Promise<{
    saasBillingSubscriptionId: string;
    /** Tariff currently assigned to the paid subscription; may differ from a scheduled next tariff. */
    currentTariffId: string;
    tariffId: string;
    billingPeriod: SaasBillingPeriod;
    /** Existing paid period is the renewal anchor; `null` only before the first payment. */
    currentPeriodStartsAt: string | null;
    currentPeriodEndsAt: string | null;
    /** К6 — lets the caller decide whether THIS payment still needs `save_payment_method: true`. */
    savedPaymentMethodId: string | null;
    additionalSeatPriceMinor: number | null;
    currency: string | null;
  }>;
  /** Promotes one already-paid future invoice at its boundary; repeats are a no-op. */
  promoteDueSaasBillingPaidInvoice(input: {
    organizationId: string;
    saasBillingSubscriptionId: string;
    asOf: string;
  }): Promise<boolean>;

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
    | { outcome: 'seat_overage_partial_refund_forbidden' }
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

  /**
   * К6 — grants (or re-grants after a revoke) explicit autopay consent on the organization's OWN
   * `paid_subscription` row. `consentText` is the exact copy the payer saw
   * (`AUTOPAY_CONSENT_TEXT`); a fresh grant clears `autopayRevokedAt` back to `null`, which is what
   * makes "active" a plain two-column read downstream. Requires the row to already exist — call
   * `requireOwnTariffBillingSubscription` first, same as everywhere else this row is touched.
   */
  grantSaasBillingAutopayConsent(input: {
    organizationId: string;
    consentText: string;
    consentedAt: string;
  }): Promise<{ outcome: 'no_subscription' } | { outcome: 'granted' }>;
  /** К6 — stops future off-session charges; does not touch `savedPaymentMethodId` (a manual payment can still reuse it via a fresh checkout). */
  revokeSaasBillingAutopayConsent(input: {
    organizationId: string;
    revokedAt: string;
  }): Promise<{ outcome: 'no_subscription' } | { outcome: 'revoked' }>;
  /**
   * К6 — called only from the webhook capture path, once `payment.succeeded` reports a
   * `payment_method` the provider actually saved. Addresses the subscription by id, same authority
   * discipline as the capture state machine.
   */
  saveSaasBillingSubscriptionPaymentMethod(input: {
    saasBillingSubscriptionId: string;
    organizationId: string;
    savedPaymentMethodId: string;
  }): Promise<void>;
  /**
   * К6 — CAS from `draft`/`pending` to `failed`, mirroring capture's invoice-state CAS:
   * an off-session charge attempt that the provider rejected (synchronously, or already resolved by
   * the time this runs) must show up as a failure the clinic can see and act on, not stay `draft`
   * forever.
   */
  markSaasBillingInvoiceFailed(input: {
    saasBillingInvoiceId: string;
    organizationId: string;
  }): Promise<SaasBillingInvoice | null>;
  /**
   * К6/B0.3 — reopens a `failed` (provider-rejected/closed) or `void` (admin-cancelled) tariff
   * invoice for the existing clinic checkout flow. The period row is retained (so a retry cannot
   * create a second period); the new deterministic provider key makes a fresh checkout possible
   * after an off-session attempt was canceled, or after an operator cancelled a stuck invoice.
   * Never touches `paid` — CAS-guarded, matching `saasBillingInvoices.status` in `('failed', 'void')`.
   */
  prepareSaasBillingFailedInvoiceForManualCheckout(input: {
    saasBillingInvoiceId: string;
    organizationId: string;
    providerId: string;
    providerIdempotencyKey: string;
  }): Promise<SaasBillingInvoice>;
};

export type SaasBillingSettingsReadPort = {
  getSaasBillingPaymentProviderValue(): Promise<unknown>;
};

export type SaasBillingPaymentProviderResolver = (providerId: string) => PaymentProviderPort;

export type ResolvedSaasBillingPaymentProvider = {
  providerId: string;
  providerConfig: PaymentProviderConfig;
  adapter: PaymentProviderPort;
  payeeRequisites: import('./settings').SaasBillingPayeeRequisites;
};
