import { describe, expect, it } from "vitest";
import { isRuMobile, isValidPhoneE164, isValidRuMobileNormalized } from "./phoneValidation";

describe("isValidRuMobileNormalized", () => {
  it("accepts +7 and 10 digits", () => {
    expect(isValidRuMobileNormalized("+79991234567")).toBe(true);
  });

  it("rejects wrong length", () => {
    expect(isValidRuMobileNormalized("+7999123456")).toBe(false);
    expect(isValidRuMobileNormalized("+799912345678")).toBe(false);
  });

  it("rejects non-RU country codes", () => {
    expect(isValidRuMobileNormalized("+19991234567")).toBe(false);
  });
});

describe("isRuMobile", () => {
  it("matches isValidRuMobileNormalized for +7 mobile", () => {
    expect(isRuMobile("+79991234567")).toBe(true);
    expect(isRuMobile("+4915123456789")).toBe(false);
  });
});

describe("isValidPhoneE164", () => {
  it("accepts sample regions (+1, +44, +49, +380, +7)", () => {
    expect(isValidPhoneE164("+12025550123")).toBe(true);
    expect(isValidPhoneE164("+442078361234")).toBe(true);
    expect(isValidPhoneE164("+4915123456789")).toBe(true);
    expect(isValidPhoneE164("+380501234567")).toBe(true);
    expect(isValidPhoneE164("+79991234567")).toBe(true);
  });

  it("rejects garbage and incomplete", () => {
    expect(isValidPhoneE164("+")).toBe(false);
    expect(isValidPhoneE164("+912")).toBe(false);
    expect(isValidPhoneE164("79991234567")).toBe(false);
    expect(isValidPhoneE164("not-a-phone")).toBe(false);
  });
});
