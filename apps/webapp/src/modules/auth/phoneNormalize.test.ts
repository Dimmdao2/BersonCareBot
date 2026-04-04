import { describe, expect, it } from "vitest";
import { normalizePhone, normalizePhoneInternational, normalizePhoneRuLegacy } from "./phoneNormalize";

const expectedRuMobile = "+79189000782";

describe("normalizePhoneRuLegacy (РФ)", () => {
  it("normalizes 10-digit mobile without country code", () => {
    expect(normalizePhoneRuLegacy("9189000782")).toBe(expectedRuMobile);
  });

  it("normalizes 10-digit city code format without country code", () => {
    expect(normalizePhoneRuLegacy("4951234567")).toBe("+74951234567");
  });

  it("normalizes 11 digits starting with 8", () => {
    expect(normalizePhoneRuLegacy("89189000782")).toBe(expectedRuMobile);
  });

  it("normalizes 8 with parentheses and hyphens", () => {
    expect(normalizePhoneRuLegacy("8(918)900-07-82")).toBe(expectedRuMobile);
  });
});

describe("normalizePhoneInternational / normalizePhone", () => {
  it("keeps valid RU E.164", () => {
    expect(normalizePhoneInternational("+79991234567")).toBe("+79991234567");
  });

  it("normalizes RU national mobile via default RU parse", () => {
    expect(normalizePhoneInternational("9189000782")).toBe(expectedRuMobile);
  });

  it("normalizes explicit US international to E.164", () => {
    expect(normalizePhoneInternational("+1 (202) 555-0123")).toBe("+12025550123");
  });

  it("normalizes UK number to E.164", () => {
    expect(normalizePhoneInternational("+44 20 7836 1234")).toBe("+442078361234");
  });

  it("normalizes German mobile to E.164", () => {
    expect(normalizePhoneInternational("+49 151 23456789")).toBe("+4915123456789");
  });

  it("normalizes UA mobile to E.164", () => {
    expect(normalizePhoneInternational("+380 50 123 4567")).toBe("+380501234567");
  });

  it("normalizePhone is alias of normalizePhoneInternational", () => {
    expect(normalizePhone("+79991234567")).toBe("+79991234567");
  });

  it("returns shortest +digits for incomplete input (validated elsewhere)", () => {
    expect(normalizePhoneInternational("912")).toBe("+912");
  });

  it("treats ambiguous 10-digit local as RU national (legacy)", () => {
    expect(normalizePhoneInternational("2025550123")).toBe("+72025550123");
  });

  it("returns '+' for empty or symbol-only input", () => {
    expect(normalizePhoneInternational("")).toBe("+");
    expect(normalizePhoneInternational("() - +")).toBe("+");
  });
});
