export type PaymentProviderVerifyResult = {
  idempotencyKey: string;
  eventType: string;
  payload: Record<string, unknown>;
  intentRef?: string;
  amountMinor?: number;
};

import type { PaymentProviderConfig } from './types';

/** К3 reconciliation — one payment as the provider itself reports it, not our journal's view of it. */
export type PaymentProviderListedPayment = {
  providerPaymentRef: string;
  status: string;
  amountMinor: number;
  currency: string;
};

export type PaymentProviderListPaymentsResult = {
  items: PaymentProviderListedPayment[];
  /** The provider's list ran past this adapter's page cap — result may be incomplete. */
  truncated: boolean;
};

export type PaymentProviderPort = {
  createIntent(params: {
    amountMinor: number;
    currency: string;
    idempotencyKey: string;
    metadata: Record<string, unknown>;
    providerConfig?: PaymentProviderConfig;
  }): Promise<{ providerIntentRef: string; checkoutUrl?: string }>;

  refund(params: {
    providerIntentRef: string;
    amountMinor: number;
    currency: string;
    idempotencyKey: string;
    providerConfig?: PaymentProviderConfig;
  }): Promise<{ providerRefundRef: string }>;

  /**
   * К4 — a shareable invoice/payment-link object, distinct from `createIntent`'s direct payment:
   * only YooKassa's `/v3/invoices` is wired today (`yookassaPaymentProvider.ts`); adapters without
   * an equivalent simply omit this method, and callers must check for its presence.
   */
  createInvoice?(params: {
    amountMinor: number;
    currency: string;
    description: string;
    /** ISO timestamp — the deadline until which the invoice can be paid. */
    expiresAt: string;
    idempotencyKey: string;
    metadata: Record<string, unknown>;
    providerConfig?: PaymentProviderConfig;
  }): Promise<{ providerInvoiceRef: string; checkoutUrl: string }>;

  /**
   * Parse only enough normalized identity to locate the server-owned intent/event authority.
   * The result is untrusted until verifyWebhook succeeds with that organization's config.
   */
  inspectWebhook(params: { headers: Headers; bodyText: string }): PaymentProviderVerifyResult;

  verifyWebhook(params: {
    headers: Headers;
    bodyText: string;
    webhookSecret: string;
    providerConfig?: PaymentProviderConfig;
  }): Promise<PaymentProviderVerifyResult>;

  /**
   * К3 — list payments the provider itself has on record for a period, for reconciliation against
   * our journal. Optional: added only where the provider's API supports it (today, ЮKassa's
   * `GET /v3/payments`); adapters without it are unaffected, and the reconciliation caller treats a
   * missing method as "provider unavailable for reconciliation", not an error.
   */
  listPayments?(params: {
    periodFromIso: string;
    periodToIso: string;
    providerConfig?: PaymentProviderConfig;
  }): Promise<PaymentProviderListPaymentsResult>;
};
