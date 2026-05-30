export type PaymentProviderVerifyResult = {
  idempotencyKey: string;
  eventType: string;
  payload: Record<string, unknown>;
  intentRef?: string;
  amountMinor?: number;
};

import type { PaymentProviderConfig } from "./types";

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

  verifyWebhook(params: {
    headers: Headers;
    bodyText: string;
    webhookSecret: string;
    providerConfig?: PaymentProviderConfig;
  }): PaymentProviderVerifyResult;
};
