import { describe, expect, it, vi } from "vitest";
import {
  mergeSaasBillingPaymentProviderSecretsRetain,
  parseSaasBillingPaymentProviderSettings,
  redactSaasBillingPaymentProviderValue,
} from "./settings";

describe("SaaS billing payment-provider settings", () => {
  it("uses the existing mock adapter as the keyless-safe default", () => {
    expect(parseSaasBillingPaymentProviderSettings(null)).toMatchObject({
      defaultProviderId: "mock",
      providers: [{ id: "mock", enabled: true }],
      lifecyclePolicy: null,
    });
  });

  it("parses the configured lifecycle policy and empty platform requisites", () => {
    expect(parseSaasBillingPaymentProviderSettings({
      value: {
        defaultProviderId: "mock",
        providers: [{ id: "mock", label: "Mock", enabled: true }],
        payeeRequisites: {
          legalEntityType: null,
          taxIdentifier: null,
          registrationReasonCode: null,
          bankAccount: null,
          taxRegime: null,
          vatRate: null,
        },
        lifecyclePolicy: { graceDays: 7, chargeAttempts: 3, readOnlyDays: 21 },
      },
    })).toMatchObject({
      lifecyclePolicy: { graceDays: 7, chargeAttempts: 3, readOnlyDays: 21 },
      payeeRequisites: { taxIdentifier: null, bankAccount: null },
    });
  });

  it("redacts provider credentials and retains stored values on a redacted write", async () => {
    const previous = {
      value: {
        defaultProviderId: "mock",
        providers: [{
          id: "mock",
          label: "Mock",
          enabled: true,
          apiKey: "configured-marker",
          webhookSecret: "configured-webhook-marker",
        }],
      },
    };
    const redacted = redactSaasBillingPaymentProviderValue(previous);
    expect(JSON.stringify(redacted)).not.toContain("configured-marker");
    expect(JSON.stringify(redacted)).not.toContain("configured-webhook-marker");

    const merged = await mergeSaasBillingPaymentProviderSecretsRetain(
      vi.fn().mockResolvedValue(previous),
      redacted,
    );
    expect(merged).toMatchObject({
      value: {
        providers: [{
          apiKey: "configured-marker",
          webhookSecret: "configured-webhook-marker",
        }],
      },
    });
  });
});
