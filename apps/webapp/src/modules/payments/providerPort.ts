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

/** Fiscal data for one operation. Amounts are minor units until an adapter serializes them. */
export type PaymentReceipt = {
  customer: { email: string };
  items: Array<{
    description: string;
    quantity: number;
    amountMinor: number;
    vatCode: string;
    paymentSubject: 'service';
    paymentMode: 'full_prepayment';
    measure: 'piece';
  }>;
  /** Required only by some third-party cash-register configurations. */
  taxSystemCode?: string;
};

/**
 * B0.3 — an adapter throws this from `createIntent` only when the PSP's own response PROVES no
 * payment was created (e.g. a synchronous 4xx before the request reached processing: bad params,
 * a rejected/reused idempotency key, auth, rate limit). Callers may safely retry under a FRESH
 * idempotency key. Any other thrown error (network failure, timeout, 5xx) is ambiguous — the PSP
 * may have created the payment before failing — and callers must retry under the SAME key so a
 * retry idempotently replays instead of risking a double charge.
 */
export class PaymentProviderRequestRefusedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PaymentProviderRequestRefusedError';
  }
}

export type PaymentProviderTransportCode =
  | 'ECONNREFUSED'
  | 'ECONNRESET'
  | 'ENOTFOUND'
  | 'ETIMEDOUT';

/**
 * The provider adapter creates this only when its own network call rejects before a response
 * exists. Provider response bodies and adapter callbacks must stay plain/domain errors: a public
 * `error.code` is not transport provenance.
 */
export class PaymentProviderTransportError extends Error {
  constructor(
    readonly transportCode: PaymentProviderTransportCode | null,
    options?: ErrorOptions,
  ) {
    super('payment_provider_transport_unavailable', options);
    this.name = 'PaymentProviderTransportError';
  }
}

/** An unfiscalized payment is worse than a loud failure. */
export function assertReceiptSupported(
  receipt: PaymentReceipt | undefined,
  providerId: string,
): void {
  if (receipt) throw new Error(`payment_provider_receipt_unsupported:${providerId}`);
}

export function assertReceiptMatchesOperation(
  receipt: PaymentReceipt,
  amountMinor: number,
  currency: string,
): void {
  if (!receipt.customer.email.trim() || !receipt.customer.email.includes('@')) {
    throw new Error('payment_receipt_customer_email_invalid');
  }
  if (receipt.items.length === 0) throw new Error('payment_receipt_items_missing');
  let itemsTotalMinor = 0;
  for (const item of receipt.items) {
    if (!item.description.trim()) throw new Error('payment_receipt_item_description_missing');
    if (!Number.isSafeInteger(item.quantity) || item.quantity <= 0) {
      throw new Error('payment_receipt_item_quantity_invalid');
    }
    if (!Number.isSafeInteger(item.amountMinor) || item.amountMinor <= 0) {
      throw new Error('payment_receipt_item_amount_invalid');
    }
    if (!item.vatCode.trim()) throw new Error('payment_receipt_item_vat_code_missing');
    itemsTotalMinor += item.quantity * item.amountMinor;
  }
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0 || itemsTotalMinor !== amountMinor) {
    throw new Error('payment_receipt_total_mismatch');
  }
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error('payment_receipt_currency_invalid');
}

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
  /** Only adapters that can issue a shareable invoice set this; it is a capability, not a second payment entry. */
  supportsInvoice?: true;

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
    /**
     * A shareable invoice/payment link instead of an immediate checkout. It is still opened
     * through this one payment door; adapters without invoice support fail closed.
     */
    invoice?: { description: string; expiresAt: string };
    receipt?: PaymentReceipt;
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
    /** Full refunds may omit it; a partial fiscal refund must provide a corrected receipt. */
    receipt?: PaymentReceipt;
    providerConfig?: PaymentProviderConfig;
  }): Promise<{ providerRefundRef: string }>;

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
