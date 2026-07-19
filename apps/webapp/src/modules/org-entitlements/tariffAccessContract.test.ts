import { describe, expect, it } from "vitest";
import { compatibilityTariffProjection, isEffectiveTariffProjectionConsistent } from "./tariffAccessContract";

describe("effective tariff source contract", () => {
  it("keeps compatibility projection aligned with a single manual source", () => {
    const access = { organizationId: "org-a", compatibilityTariffId: "tariff-a", source: { kind: "manual" as const, tariffId: "tariff-a" } };
    expect(compatibilityTariffProjection(access)).toBe("tariff-a");
    expect(isEffectiveTariffProjectionConsistent(access)).toBe(true);
  });

  it("detects divergent future paid/manual projections instead of choosing a fallback", () => {
    expect(isEffectiveTariffProjectionConsistent({ organizationId: "org-a", compatibilityTariffId: "tariff-a", source: { kind: "paid_subscription", tariffId: "tariff-b", subscriptionId: "sub-b" } })).toBe(false);
  });
});
