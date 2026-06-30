import { describe, expect, it } from "vitest";
import { getPaymentProviderAdapter } from "./paymentProviderRegistry";

describe("getPaymentProviderAdapter", () => {
  it("returns mock adapter for 'mock'", () => {
    const adapter = getPaymentProviderAdapter("mock");
    expect(adapter).toBeDefined();
    expect(typeof adapter.createIntent).toBe("function");
    expect(typeof adapter.refund).toBe("function");
    expect(typeof adapter.verifyWebhook).toBe("function");
  });

  it("returns yookassa adapter for 'yookassa'", () => {
    const adapter = getPaymentProviderAdapter("yookassa");
    expect(adapter).toBeDefined();
  });

  it("returns tinkoff adapter for 'tinkoff'", () => {
    const adapter = getPaymentProviderAdapter("tinkoff");
    expect(adapter).toBeDefined();
  });

  it("returns cloudpayments adapter for 'cloudpayments'", () => {
    const adapter = getPaymentProviderAdapter("cloudpayments");
    expect(adapter).toBeDefined();
  });

  it("returns alfabank adapter for 'alfabank'", () => {
    const adapter = getPaymentProviderAdapter("alfabank");
    expect(adapter).toBeDefined();
  });

  it("returns the same singleton instance on repeated calls", () => {
    const a1 = getPaymentProviderAdapter("tinkoff");
    const a2 = getPaymentProviderAdapter("tinkoff");
    expect(a1).toBe(a2);
  });

  it("throws unsupported_payment_provider for unknown id", () => {
    expect(() => getPaymentProviderAdapter("unknown-provider")).toThrow(
      "unsupported_payment_provider:unknown-provider",
    );
  });

  it("trims whitespace from provider id", () => {
    const adapter = getPaymentProviderAdapter(" alfabank ");
    expect(adapter).toBeDefined();
  });
});
