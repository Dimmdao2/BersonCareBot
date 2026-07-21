import { createHash, createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { computeCloudPaymentsHmac } from "@/infra/payments/cloudpaymentsPaymentProvider";
import { getPaymentProviderAdapter } from "@/infra/payments/paymentProviderRegistry";
import { computeTinkoffToken } from "@/infra/payments/tinkoffPaymentProvider";

const stableKey = "appointment_prepay:10000000-0000-4000-8000-000000000001";
const secret = "synthetic-lifecycle-secret";

function verifiedLifecycle(providerId: string) {
  if (providerId === "cloudpayments") {
    return ["Completed", "Cancelled"].map((status) => {
      const bodyText = JSON.stringify({ TransactionId: 101, InvoiceId: stableKey, Status: status });
      return getPaymentProviderAdapter(providerId).verifyWebhook({
        headers: new Headers({ "content-hmac": computeCloudPaymentsHmac(bodyText, secret) }),
        bodyText,
        webhookSecret: secret,
      });
    });
  }
  if (providerId === "tinkoff") {
    return ["CONFIRMED", "REFUNDED"].map((status) => {
      const payload: Record<string, unknown> = {
        PaymentId: 202,
        OrderId: stableKey,
        Status: status,
      };
      payload.Token = computeTinkoffToken(payload, secret);
      return getPaymentProviderAdapter(providerId).verifyWebhook({
        headers: new Headers(),
        bodyText: JSON.stringify(payload),
        webhookSecret: secret,
      });
    });
  }
  if (providerId === "alfabank") {
    return [2, 6].map((orderStatus) => {
      const mdOrder = "alfa-order-303";
      const checksum = createHash("sha256").update(mdOrder + secret).digest("hex");
      const bodyText = JSON.stringify({ mdOrder, orderNumber: stableKey, orderStatus, checksum });
      return getPaymentProviderAdapter(providerId).verifyWebhook({
        headers: new Headers({ "content-type": "application/json" }),
        bodyText,
        webhookSecret: secret,
      });
    });
  }
  return [
    { event: "payment.succeeded", status: "succeeded" },
    { event: "payment.canceled", status: "canceled" },
  ].map(({ event, status }) => {
    const bodyText = JSON.stringify({
      event,
      object: { id: "yoo-payment-404", status, metadata: { idempotencyKey: stableKey } },
    });
    return getPaymentProviderAdapter("yookassa").verifyWebhook({
      headers: new Headers({
        "x-yookassa-signature": createHmac("sha256", secret).update(bodyText).digest("hex"),
      }),
      bodyText,
      webhookSecret: secret,
    });
  });
}

describe("production provider lifecycle identity", () => {
  it.each(["cloudpayments", "tinkoff", "alfabank", "yookassa"])(
    "%s keeps one server key while exposing distinct lifecycle event types",
    (providerId) => {
      const [first, second] = verifiedLifecycle(providerId);
      expect(first?.idempotencyKey).toBe(stableKey);
      expect(second?.idempotencyKey).toBe(stableKey);
      expect(first?.eventType).not.toBe(second?.eventType);
    },
  );
});
