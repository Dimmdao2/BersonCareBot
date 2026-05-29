export type PaymentProviderVerifyResult = {
  idempotencyKey: string;
  eventType: string;
  payload: Record<string, unknown>;
  intentRef?: string;
  amountMinor?: number;
};

export type PaymentProviderPort = {
  createIntent(params: {
    amountMinor: number;
    currency: string;
    idempotencyKey: string;
    metadata: Record<string, unknown>;
  }): Promise<{ providerIntentRef: string; checkoutUrl?: string }>;

  refund(params: {
    providerIntentRef: string;
    amountMinor: number;
    currency: string;
    idempotencyKey: string;
  }): Promise<{ providerRefundRef: string }>;

  verifyWebhook(params: {
    headers: Headers;
    bodyText: string;
    webhookSecret: string;
  }): PaymentProviderVerifyResult;
};
