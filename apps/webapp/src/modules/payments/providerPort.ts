export type PaymentProviderVerifyResult = {
  idempotencyKey: string;
  eventType: string;
  payload: Record<string, unknown>;
  intentRef?: string;
  amountMinor?: number;
};

import type { PaymentProviderConfig } from './types';

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
};
