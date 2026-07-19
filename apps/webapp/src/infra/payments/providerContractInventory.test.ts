import { describe, expect, it } from "vitest";
import { getPaymentProviderAdapter } from "./paymentProviderRegistry";

const PROVIDER_IDS = ["mock", "yookassa", "tinkoff", "cloudpayments", "alfabank"] as const;

describe("S4 payment provider contract inventory", () => {
  it.each(PROVIDER_IDS)("exposes the common checkout/refund/verified-callback contract for %s", (providerId) => {
    const provider = getPaymentProviderAdapter(providerId);
    expect(provider.createIntent).toBeTypeOf("function");
    expect(provider.refund).toBeTypeOf("function");
    expect(provider.verifyWebhook).toBeTypeOf("function");
  });

  it("rejects an unsigned mock callback before it can be considered confirmed", () => {
    const provider = getPaymentProviderAdapter("mock");
    expect(() =>
      provider.verifyWebhook({
        headers: new Headers(),
        bodyText: JSON.stringify({ idempotencyKey: "intent-1", eventType: "payment.succeeded" }),
        webhookSecret: "test-secret",
      }),
    ).toThrow("invalid_webhook_signature");
  });
});
