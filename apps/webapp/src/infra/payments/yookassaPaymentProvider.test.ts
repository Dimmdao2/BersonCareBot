import { describe, expect, it } from "vitest";
import { createYookassaPaymentProvider } from "./yookassaPaymentProvider";

describe("createYookassaPaymentProvider", () => {
  it("verifyWebhook maps payment.succeeded to payment.succeeded", () => {
    const provider = createYookassaPaymentProvider();
    const body = JSON.stringify({
      event: "payment.succeeded",
      object: {
        id: "pay-yk-1",
        status: "succeeded",
        amount: { value: "10.00", currency: "RUB" },
        metadata: { idempotencyKey: "idem-1" },
      },
    });
    const headers = new Headers();
    headers.set(
      "authorization",
      `Basic ${Buffer.from("shop-1:api-key-1").toString("base64")}`,
    );
    const verified = provider.verifyWebhook({
      headers,
      bodyText: body,
      webhookSecret: "wh-secret",
      providerConfig: {
        id: "yookassa",
        label: "YooKassa",
        enabled: true,
        shopId: "shop-1",
        apiKey: "api-key-1",
      },
    });
    expect(verified.idempotencyKey).toBe("idem-1");
    expect(verified.eventType).toBe("payment.succeeded");
    expect(verified.intentRef).toBe("pay-yk-1");
    expect(verified.amountMinor).toBe(1000);
  });

  it("verifyWebhook throws on invalid signature", () => {
    const provider = createYookassaPaymentProvider();
    const body = JSON.stringify({
      event: "payment.succeeded",
      object: { id: "pay-yk-1", status: "succeeded" },
    });
    const headers = new Headers();
    headers.set("authorization", "Basic bad");
    expect(() =>
      provider.verifyWebhook({
        headers,
        bodyText: body,
        webhookSecret: "wh-secret",
        providerConfig: {
          id: "yookassa",
          label: "YooKassa",
          enabled: true,
          shopId: "shop-1",
          apiKey: "api-key-1",
        },
      }),
    ).toThrow("invalid_webhook_signature");
  });
});
