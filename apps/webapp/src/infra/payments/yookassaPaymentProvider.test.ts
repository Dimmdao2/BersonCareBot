import { afterEach, describe, expect, it, vi } from "vitest";
import { createYookassaPaymentProvider } from "./yookassaPaymentProvider";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createYookassaPaymentProvider", () => {
  it("preserves create idempotency through the bounded fetch", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "pay-yk-create",
          confirmation: { confirmation_url: "https://checkout.test/pay-yk-create" },
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const provider = createYookassaPaymentProvider();

    await expect(
      provider.createIntent({
        amountMinor: 1_250,
        currency: "RUB",
        idempotencyKey: "idem-create-1",
        metadata: { purpose: "booking" },
        providerConfig: {
          id: "yookassa",
          label: "YooKassa",
          enabled: true,
          shopId: "shop-1",
          apiKey: "api-key-1",
        },
      }),
    ).resolves.toEqual({
      providerIntentRef: "pay-yk-create",
      checkoutUrl: "https://checkout.test/pay-yk-create",
    });

    const call = fetchMock.mock.calls[0];
    const init = call?.[1];
    expect(call?.[0]).toBe("https://api.yookassa.ru/v3/payments");
    expect(new Headers(init?.headers).get("Idempotence-Key")).toBe("idem-create-1");
    expect(JSON.parse(String(init?.body))).toMatchObject({
      metadata: { idempotencyKey: "idem-create-1", purpose: "booking" },
    });
  });

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
