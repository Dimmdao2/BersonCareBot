import { createHmac, timingSafeEqual } from "node:crypto";
import type { PaymentProviderPort } from "@/modules/payments/providerPort";

function signMockPayload(secret: string, body: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

export function createMockPaymentProvider(): PaymentProviderPort {
  return {
    async createIntent({ amountMinor, currency, idempotencyKey, metadata }) {
      const providerIntentRef = `mock_intent_${idempotencyKey}`;
      void amountMinor;
      void currency;
      void metadata;
      return { providerIntentRef };
    },

    async refund({ idempotencyKey }) {
      return { providerRefundRef: `mock_refund_${idempotencyKey}` };
    },

    verifyWebhook({ headers, bodyText, webhookSecret }) {
      const signature = headers.get("x-mock-signature") ?? "";
      const expected = signMockPayload(webhookSecret, bodyText);
      const a = Buffer.from(signature);
      const b = Buffer.from(expected);
      if (a.length !== b.length || !timingSafeEqual(a, b)) {
        throw new Error("invalid_webhook_signature");
      }
      const payload = JSON.parse(bodyText) as Record<string, unknown>;
      const idempotencyKey = String(payload.idempotencyKey ?? "");
      const eventType = String(payload.eventType ?? "");
      if (!idempotencyKey || !eventType) throw new Error("invalid_webhook_payload");
      return {
        idempotencyKey,
        eventType,
        payload,
        intentRef: typeof payload.intentRef === "string" ? payload.intentRef : undefined,
        amountMinor: typeof payload.amountMinor === "number" ? payload.amountMinor : undefined,
      };
    },
  };
}

const providers = new Map<string, PaymentProviderPort>();

export function getPaymentProviderAdapter(providerId: string): PaymentProviderPort {
  if (providerId !== "mock") throw new Error(`unsupported_payment_provider:${providerId}`);
  let adapter = providers.get(providerId);
  if (!adapter) {
    adapter = createMockPaymentProvider();
    providers.set(providerId, adapter);
  }
  return adapter;
}
