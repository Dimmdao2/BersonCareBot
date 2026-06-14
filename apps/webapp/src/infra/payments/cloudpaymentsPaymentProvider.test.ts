import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  computeCloudPaymentsHmac,
  createCloudpaymentsPaymentProvider,
} from "./cloudpaymentsPaymentProvider";

describe("computeCloudPaymentsHmac", () => {
  it("produces base64-encoded HMAC-SHA256 of the body with the given secret", () => {
    const body = '{"TransactionId":12345,"InvoiceId":"my-order","Status":"Completed"}';
    const secret = "cp-api-secret";
    const expected = createHmac("sha256", secret).update(body).digest("base64");
    expect(computeCloudPaymentsHmac(body, secret)).toBe(expected);
  });

  it("produces different values for different bodies", () => {
    const secret = "s1";
    const h1 = computeCloudPaymentsHmac("body1", secret);
    const h2 = computeCloudPaymentsHmac("body2", secret);
    expect(h1).not.toBe(h2);
  });

  it("produces different values for different secrets", () => {
    const body = "same-body";
    expect(computeCloudPaymentsHmac(body, "s1")).not.toBe(computeCloudPaymentsHmac(body, "s2"));
  });
});

describe("createCloudpaymentsPaymentProvider.verifyWebhook", () => {
  const provider = createCloudpaymentsPaymentProvider();
  const secret = "cp-secret";

  function signedHeaders(body: string): Headers {
    const headers = new Headers();
    headers.set("content-hmac", computeCloudPaymentsHmac(body, secret));
    headers.set("content-type", "application/json");
    return headers;
  }

  it("verifies JSON webhook and maps Completed status (code 3) to payment.succeeded", () => {
    const body = JSON.stringify({
      TransactionId: 12345,
      InvoiceId: "idempotency-key-1",
      StatusCode: 3,
      Status: "Completed",
      Amount: 100.0,
    });
    const result = provider.verifyWebhook({
      headers: signedHeaders(body),
      bodyText: body,
      webhookSecret: secret,
    });
    expect(result.idempotencyKey).toBe("idempotency-key-1");
    expect(result.eventType).toBe("payment.succeeded");
    expect(result.intentRef).toBe("12345");
    expect(result.amountMinor).toBe(10000); // 100.00 * 100
  });

  it("maps StatusCode 4 (Cancelled) to payment.refunded", () => {
    const body = JSON.stringify({
      TransactionId: 99,
      InvoiceId: "idem-2",
      StatusCode: 4,
      Status: "Cancelled",
      Amount: 50.0,
    });
    const result = provider.verifyWebhook({
      headers: signedHeaders(body),
      bodyText: body,
      webhookSecret: secret,
    });
    expect(result.eventType).toBe("payment.refunded");
  });

  it("maps unknown status to cloudpayments.{status}", () => {
    const body = JSON.stringify({
      TransactionId: 77,
      InvoiceId: "idem-3",
      StatusCode: 1,
      Status: "Authorized",
      Amount: 10.0,
    });
    const result = provider.verifyWebhook({
      headers: signedHeaders(body),
      bodyText: body,
      webhookSecret: secret,
    });
    expect(result.eventType).toBe("cloudpayments.authorized");
  });

  it("verifies form-encoded webhook body", () => {
    const params = new URLSearchParams({
      TransactionId: "777",
      InvoiceId: "order-form",
      StatusCode: "3",
      Status: "Completed",
      Amount: "25.50",
    });
    const body = params.toString();
    const headers = new Headers();
    headers.set("content-hmac", computeCloudPaymentsHmac(body, secret));
    headers.set("content-type", "application/x-www-form-urlencoded");

    const result = provider.verifyWebhook({
      headers,
      bodyText: body,
      webhookSecret: secret,
    });
    expect(result.idempotencyKey).toBe("order-form");
    expect(result.eventType).toBe("payment.succeeded");
    expect(result.intentRef).toBe("777");
    expect(result.amountMinor).toBe(2550); // 25.50 * 100
  });

  it("throws invalid_webhook_signature on wrong HMAC", () => {
    const body = JSON.stringify({ TransactionId: 1, InvoiceId: "x", StatusCode: 3 });
    const headers = new Headers();
    headers.set("content-hmac", "bad-signature");
    headers.set("content-type", "application/json");

    expect(() =>
      provider.verifyWebhook({
        headers,
        bodyText: body,
        webhookSecret: secret,
      }),
    ).toThrow("invalid_webhook_signature");
  });

  it("throws cloudpayments_webhook_missing_hmac when Content-HMAC header absent", () => {
    const body = JSON.stringify({ TransactionId: 1, InvoiceId: "x", StatusCode: 3 });
    const headers = new Headers();
    headers.set("content-type", "application/json");

    expect(() =>
      provider.verifyWebhook({
        headers,
        bodyText: body,
        webhookSecret: secret,
      }),
    ).toThrow("cloudpayments_webhook_missing_hmac");
  });

  it("falls back to TransactionId as idempotencyKey when InvoiceId absent", () => {
    const body = JSON.stringify({ TransactionId: 42, StatusCode: 3, Status: "Completed" });
    const result = provider.verifyWebhook({
      headers: signedHeaders(body),
      bodyText: body,
      webhookSecret: secret,
    });
    expect(result.idempotencyKey).toBe("42");
  });
});
