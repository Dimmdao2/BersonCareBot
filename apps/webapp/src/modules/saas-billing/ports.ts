import type { PaymentProviderPort } from '@/modules/payments/providerPort';
import type { PaymentProviderConfig } from '@/modules/payments/types';
import type { OrgCommercialLifecycleState } from '@/modules/org-entitlements/types';
import type { SaasBillingPeriod } from './paidPeriod';

export type SaasBillingSource = 'manual' | 'paid_subscription';
export type SaasBillingSubscriptionStatus = 'pending_payment' | 'active' | 'expired' | 'cancelled';
export type SaasBillingInvoiceStatus = 'draft' | 'pending' | 'paid' | 'failed' | 'void';

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
