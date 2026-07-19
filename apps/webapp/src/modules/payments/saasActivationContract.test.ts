import { describe, expect, it } from "vitest";
import { mayActivateFutureSaasAccess } from "./saasActivationContract";

describe("future SaaS payment activation contract", () => {
  it("does not activate a subscription or grant from an unconfirmed callback", () => {
    expect(mayActivateFutureSaasAccess({
      signatureVerified: false,
      statusVerified: true,
      amountMatches: true,
      currencyMatches: true,
      eventType: "payment.succeeded",
    })).toBe(false);
  });

  it("requires verified status, amount, currency, and successful event together", () => {
    expect(mayActivateFutureSaasAccess({
      signatureVerified: true,
      statusVerified: true,
      amountMatches: true,
      currencyMatches: true,
      eventType: "payment.succeeded",
    })).toBe(true);
  });
});
