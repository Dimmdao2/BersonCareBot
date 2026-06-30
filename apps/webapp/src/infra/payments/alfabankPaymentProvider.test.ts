import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createAlfabankPaymentProvider } from "./alfabankPaymentProvider";

/**
 * Alfa-Bank webhook verification tests.
 *
 * Alfa-Bank sends a callback with:
 *   - mdOrder: Alfa's internal order ID (= providerIntentRef)
 *   - orderNumber: our orderNumber (= idempotencyKey)
 *   - checksum: SHA-256(mdOrder + secret) hex — when configured
 *   - orderStatus: 2=APPROVED, 4=REVERSED, 6=REFUNDED
 */

function computeAlfaChecksum(mdOrder: string, secret: string): string {
  return createHash("sha256").update(mdOrder + secret).digest("hex");
}

describe("createAlfabankPaymentProvider.verifyWebhook", () => {
  const provider = createAlfabankPaymentProvider();
  const secret = "alfa-webhook-secret";

  it("verifies form-encoded webhook with valid checksum and orderStatus=2 (APPROVED)", () => {
    const mdOrder = "alfa-order-uuid-1";
    const checksum = computeAlfaChecksum(mdOrder, secret);
    const params = new URLSearchParams({
      mdOrder,
      orderNumber: "my-idempotency-key",
      orderStatus: "2",
      amount: "15000",
      checksum,
    });

    const headers = new Headers();
    headers.set("content-type", "application/x-www-form-urlencoded");

    const result = provider.verifyWebhook({
      headers,
      bodyText: params.toString(),
      webhookSecret: secret,
    });

    expect(result.idempotencyKey).toBe("my-idempotency-key");
    expect(result.eventType).toBe("payment.succeeded");
    expect(result.intentRef).toBe(mdOrder);
    expect(result.amountMinor).toBe(15000);
  });

  it("maps orderStatus=4 (REVERSED) to payment.refunded", () => {
    const mdOrder = "alfa-order-2";
    const checksum = computeAlfaChecksum(mdOrder, secret);
    const params = new URLSearchParams({
      mdOrder,
      orderNumber: "idem-2",
      orderStatus: "4",
      checksum,
    });
    const result = provider.verifyWebhook({
      headers: new Headers([["content-type", "application/x-www-form-urlencoded"]]),
      bodyText: params.toString(),
      webhookSecret: secret,
    });
    expect(result.eventType).toBe("payment.refunded");
  });

  it("maps orderStatus=6 (REFUNDED) to payment.refunded", () => {
    const mdOrder = "alfa-order-3";
    const checksum = computeAlfaChecksum(mdOrder, secret);
    const params = new URLSearchParams({
      mdOrder,
      orderNumber: "idem-3",
      orderStatus: "6",
      checksum,
    });
    const result = provider.verifyWebhook({
      headers: new Headers([["content-type", "application/x-www-form-urlencoded"]]),
      bodyText: params.toString(),
      webhookSecret: secret,
    });
    expect(result.eventType).toBe("payment.refunded");
  });

  it("maps unknown orderStatus to alfabank.status_{N}", () => {
    const mdOrder = "alfa-order-4";
    const checksum = computeAlfaChecksum(mdOrder, secret);
    const params = new URLSearchParams({
      mdOrder,
      orderNumber: "idem-4",
      orderStatus: "1", // 1 = PENDING
      checksum,
    });
    const result = provider.verifyWebhook({
      headers: new Headers([["content-type", "application/x-www-form-urlencoded"]]),
      bodyText: params.toString(),
      webhookSecret: secret,
    });
    expect(result.eventType).toBe("alfabank.status_1");
  });

  it("throws invalid_webhook_signature on bad checksum", () => {
    const params = new URLSearchParams({
      mdOrder: "alfa-order-x",
      orderNumber: "idem-x",
      orderStatus: "2",
      checksum: "bad-checksum",
    });
    expect(() =>
      provider.verifyWebhook({
        headers: new Headers([["content-type", "application/x-www-form-urlencoded"]]),
        bodyText: params.toString(),
        webhookSecret: secret,
      }),
    ).toThrow("invalid_webhook_signature");
  });

  it("accepts webhook without checksum (caller must verify via getOrderStatusExtended)", () => {
    // Alfa-Bank can be configured without checksum — accepted by adapter
    const params = new URLSearchParams({
      mdOrder: "alfa-order-no-cs",
      orderNumber: "idem-no-cs",
      orderStatus: "2",
    });
    const result = provider.verifyWebhook({
      headers: new Headers([["content-type", "application/x-www-form-urlencoded"]]),
      bodyText: params.toString(),
      webhookSecret: secret,
    });
    expect(result.eventType).toBe("payment.succeeded");
  });

  it("parses JSON body", () => {
    const mdOrder = "alfa-json-order";
    const checksum = computeAlfaChecksum(mdOrder, secret);
    const body = JSON.stringify({ mdOrder, orderNumber: "json-idem", orderStatus: 2, checksum });
    const result = provider.verifyWebhook({
      headers: new Headers([["content-type", "application/json"]]),
      bodyText: body,
      webhookSecret: secret,
    });
    expect(result.idempotencyKey).toBe("json-idem");
    expect(result.eventType).toBe("payment.succeeded");
    expect(result.intentRef).toBe(mdOrder);
  });

  it("falls back to mdOrder as idempotencyKey when orderNumber absent", () => {
    const mdOrder = "alfa-fallback";
    const checksum = computeAlfaChecksum(mdOrder, secret);
    const params = new URLSearchParams({ mdOrder, orderStatus: "2", checksum });
    const result = provider.verifyWebhook({
      headers: new Headers([["content-type", "application/x-www-form-urlencoded"]]),
      bodyText: params.toString(),
      webhookSecret: secret,
    });
    expect(result.idempotencyKey).toBe(mdOrder);
  });
});
