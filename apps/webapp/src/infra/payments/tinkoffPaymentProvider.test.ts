import { describe, expect, it } from "vitest";
import { computeTinkoffToken, createTinkoffPaymentProvider } from "./tinkoffPaymentProvider";

describe("computeTinkoffToken", () => {
  it("produces SHA-256 of sorted values with Password appended", () => {
    // Canonical example from Tinkoff docs:
    // params = { TerminalKey: "TinkoffBankTest", Amount: 140000, OrderId: "21050" }
    // Password = "TestPassword"
    // Sorted keys: Amount, OrderId, Password, TerminalKey
    // Concatenated: "140000" + "21050" + "TestPassword" + "TinkoffBankTest"
    const params: Record<string, unknown> = {
      TerminalKey: "TinkoffBankTest",
      Amount: 140000,
      OrderId: "21050",
    };
    const token = computeTinkoffToken(params, "TestPassword");
    // Pre-computed SHA-256 of "14000021050TestPasswordTinkoffBankTest"
    const expected = require("node:crypto")
      .createHash("sha256")
      .update("14000021050TestPasswordTinkoffBankTest")
      .digest("hex");
    expect(token).toBe(expected);
  });

  it("excludes Token field when computing token", () => {
    const params: Record<string, unknown> = {
      TerminalKey: "terminal-1",
      Amount: 5000,
      OrderId: "order-1",
      Token: "should-be-ignored",
    };
    const withToken = computeTinkoffToken(params, "pass");
    const withoutToken = computeTinkoffToken(
      { TerminalKey: "terminal-1", Amount: 5000, OrderId: "order-1" },
      "pass",
    );
    expect(withToken).toBe(withoutToken);
  });

  it("sorts keys alphabetically before concatenation", () => {
    const params1: Record<string, unknown> = { B: "2", A: "1", C: "3" };
    const params2: Record<string, unknown> = { C: "3", A: "1", B: "2" };
    expect(computeTinkoffToken(params1, "pass")).toBe(computeTinkoffToken(params2, "pass"));
  });
});

describe("createTinkoffPaymentProvider.verifyWebhook", () => {
  const provider = createTinkoffPaymentProvider();

  function buildWebhookBody(params: Record<string, unknown>, password: string): string {
    const token = computeTinkoffToken(params, password);
    return JSON.stringify({ ...params, Token: token });
  }

  it("verifies valid webhook and maps CONFIRMED to payment.succeeded", () => {
    const password = "tinkoff-test-pass";
    const params: Record<string, unknown> = {
      TerminalKey: "terminal-1",
      OrderId: "my-idempotency-key",
      PaymentId: "pay-tk-1",
      Amount: 10000,
      Status: "CONFIRMED",
    };
    const body = buildWebhookBody(params, password);
    const headers = new Headers();

    const result = provider.verifyWebhook({
      headers,
      bodyText: body,
      webhookSecret: password,
    });

    expect(result.idempotencyKey).toBe("my-idempotency-key");
    expect(result.eventType).toBe("payment.succeeded");
    expect(result.intentRef).toBe("pay-tk-1");
    expect(result.amountMinor).toBe(10000);
  });

  it("maps REFUNDED status to payment.refunded", () => {
    const password = "pass";
    const params: Record<string, unknown> = {
      TerminalKey: "t1",
      OrderId: "order-refund",
      PaymentId: "pay-2",
      Amount: 5000,
      Status: "REFUNDED",
    };
    const body = buildWebhookBody(params, password);
    const result = provider.verifyWebhook({
      headers: new Headers(),
      bodyText: body,
      webhookSecret: password,
    });
    expect(result.eventType).toBe("payment.refunded");
  });

  it("maps unknown status to tinkoff.{status}", () => {
    const password = "pass";
    const params: Record<string, unknown> = {
      TerminalKey: "t1",
      OrderId: "order-3",
      PaymentId: "pay-3",
      Amount: 2000,
      Status: "AUTHORIZED",
    };
    const body = buildWebhookBody(params, password);
    const result = provider.verifyWebhook({
      headers: new Headers(),
      bodyText: body,
      webhookSecret: password,
    });
    expect(result.eventType).toBe("tinkoff.authorized");
  });

  it("throws invalid_webhook_signature on bad token", () => {
    const body = JSON.stringify({
      TerminalKey: "t1",
      OrderId: "o1",
      PaymentId: "p1",
      Status: "CONFIRMED",
      Token: "bad-token",
    });
    expect(() =>
      provider.verifyWebhook({
        headers: new Headers(),
        bodyText: body,
        webhookSecret: "correct-password",
      }),
    ).toThrow("invalid_webhook_signature");
  });

  it("throws tinkoff_webhook_missing_token when Token is absent", () => {
    const body = JSON.stringify({
      TerminalKey: "t1",
      OrderId: "o1",
      Status: "CONFIRMED",
    });
    expect(() =>
      provider.verifyWebhook({
        headers: new Headers(),
        bodyText: body,
        webhookSecret: "pass",
      }),
    ).toThrow("tinkoff_webhook_missing_token");
  });

  it("falls back to PaymentId as idempotencyKey when OrderId absent", () => {
    const password = "pass";
    const params: Record<string, unknown> = {
      TerminalKey: "t1",
      PaymentId: "pay-fallback",
      Amount: 1000,
      Status: "CONFIRMED",
    };
    const body = buildWebhookBody(params, password);
    const result = provider.verifyWebhook({
      headers: new Headers(),
      bodyText: body,
      webhookSecret: password,
    });
    expect(result.idempotencyKey).toBe("pay-fallback");
  });
});
