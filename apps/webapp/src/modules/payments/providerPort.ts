export type PaymentProviderVerifyResult = {
  idempotencyKey: string;
  eventType: string;
  payload: Record<string, unknown>;
  intentRef?: string;
  amountMinor?: number;
  /** К6 — present only when the provider reports it actually SAVED a reusable payment method
   *  (YooKassa `payment_method.saved === true`); read only from the trusted API refetch, never the
   *  unverified notification body. */
  savedPaymentMethodId?: string;
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
  /**
   * B1.1 — the one door every payment intent is opened through. `payerRef`, `purpose`, `subjectRef`
   * and `returnUrl` are required IN THE TYPE, not carried in `metadata`: forgetting one fails the
   * build instead of silently landing the payer on the provider's own site
   * (`https://yookassa.ru` and friends — deleted from the adapters, nothing left to fall back to).
   */
  createIntent(params: {
    amountMinor: number;
    currency: string;
    idempotencyKey: string;
    /** Кто платит — ссылка на уже опознанного плательщика (`platform_user:<id>` / `organization:<id>`); как он опознан, дверь не знает. */
    payerRef: string;
    /** За что — повод оплаты значением (например `appointment_prepayment`, `saas_billing_tariff_renewal`), не веткой кода. */
    purpose: string;
    /** За что — ссылка на оплачиваемый предмет (id брони, счёта и т.п.). */
    subjectRef: string;
    /** Куда вернуть — адрес нашего экрана; провайдер получает его отсюда, не из мешка. */
    returnUrl: string;
    metadata: Record<string, unknown>;
    providerConfig?: PaymentProviderConfig;
    /** К6 — ask the provider to keep this payment's method for a later off-session charge. Ignored together with `confirmation`/redirect once `paymentMethodId` is set. */
    savePaymentMethod?: boolean;
    /** К6 — charge a PREVIOUSLY saved method with no payer interaction (the renewal tick's autopay path), instead of opening a checkout redirect. */
    paymentMethodId?: string;
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
