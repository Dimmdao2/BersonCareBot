import { describe, expect, it } from "vitest";
import { isTrustedPatientPhoneActivation } from "./trustedPhonePolicy";

describe("isTrustedPatientPhoneActivation", () => {
  it("false when no phone", () => {
    expect(isTrustedPatientPhoneActivation({ phone_normalized: null, patient_phone_trust_at: new Date() })).toBe(
      false,
    );
    expect(isTrustedPatientPhoneActivation({ phone_normalized: "  ", patient_phone_trust_at: new Date() })).toBe(
      false,
    );
  });

  it("false when phone without trust timestamp", () => {
    expect(
      isTrustedPatientPhoneActivation({ phone_normalized: "+79990000001", patient_phone_trust_at: null }),
    ).toBe(false);
  });

  it("true when non-empty phone and trust timestamp", () => {
    expect(
      isTrustedPatientPhoneActivation({ phone_normalized: "+79990000001", patient_phone_trust_at: new Date() }),
    ).toBe(true);
    expect(
      isTrustedPatientPhoneActivation({ phone_normalized: "+79990000001", patient_phone_trust_at: "2026-01-01" }),
    ).toBe(true);
  });
});
