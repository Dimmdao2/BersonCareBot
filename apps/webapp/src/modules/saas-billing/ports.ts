import type { PaymentProviderPort } from "@/modules/payments/providerPort";
import type { PaymentProviderConfig } from "@/modules/payments/types";
import type { OrgCommercialLifecycleState } from "@/modules/org-entitlements/types";

export type SaasBillingSource = "manual" | "paid_subscription";
export type SaasBillingSubscriptionStatus =
  | "pending_payment"
  | "active"
  | "expired"
  | "cancelled";
export type SaasBillingInvoiceStatus = "draft" | "pending" | "paid" | "failed" | "void";

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
  tariffBillingPeriod: "day" | "month" | "year";
  servicePeriodStartsAt: string;
  servicePeriodEndsAt: string;
  status: SaasBillingInvoiceStatus;
  providerId: string;
  providerInvoiceRef: string | null;
  providerCheckoutUrl: string | null;
  providerIdempotencyKey: string;
};

export type SaasBillingRepositoryPort = {
  upsertManualSaasBillingSubscription(input: {
    organizationId: string;
    tariffId: string | null;
  }): Promise<SaasBillingSubscription | null>;
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
    providerId: string;
    providerEventId: string;
    eventType: string;
    rawPayload: Record<string, unknown>;
  }): Promise<{ created: boolean }>;
};

export type SaasBillingSettingsReadPort = {
  getSaasBillingPaymentProviderValue(): Promise<unknown>;
};

export type SaasBillingPaymentProviderResolver = (
  providerId: string,
) => PaymentProviderPort;

export type ResolvedSaasBillingPaymentProvider = {
  providerId: string;
  providerConfig: PaymentProviderConfig;
  adapter: PaymentProviderPort;
};
