import { describe, expect, it } from "vitest";
import { computePrepaymentAmount, quotePrepayment } from "./prepaymentCalculator";

describe("prepaymentCalculator", () => {
  it("computes percent and full_price", () => {
    expect(
      computePrepaymentAmount({
        mode: "percent",
        amountMinor: null,
        percentBps: 2500,
        servicePriceMinor: 10_000,
      }),
    ).toBe(2500);
    expect(
      computePrepaymentAmount({
        mode: "full_price",
        amountMinor: null,
        percentBps: null,
        servicePriceMinor: 4200,
      }),
    ).toBe(4200);
  });

  it("quote returns required when enabled and amount positive", () => {
    const q = quotePrepayment({
      policy: {
        id: "p1",
        organizationId: "o1",
        serviceId: "s1",
        onlineCategory: null,
        mode: "fixed_minor",
        amountMinor: 50000,
        percentBps: null,
        currency: "RUB",
        isActive: true,
      },
      servicePriceMinor: 100_000,
      currency: "RUB",
      paymentsGloballyEnabled: true,
    });
    expect(q.required).toBe(true);
    expect(q.amountMinor).toBe(50000);
  });
});
