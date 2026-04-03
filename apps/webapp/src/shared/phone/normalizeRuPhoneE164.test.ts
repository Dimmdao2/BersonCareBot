import { describe, expect, it } from "vitest";
import { normalizeRuPhoneE164 } from "./normalizeRuPhoneE164";

describe("normalizeRuPhoneE164", () => {
  it("normalizes 8… and local 10-digit numbers to +7…", () => {
    expect(normalizeRuPhoneE164("8 (999) 123-45-67")).toBe("+79991234567");
    expect(normalizeRuPhoneE164("9991234567")).toBe("+79991234567");
    expect(normalizeRuPhoneE164("4951234567")).toBe("+74951234567");
  });

  it("supports 00 prefix and toll-free numbers", () => {
    expect(normalizeRuPhoneE164("007 999 123 45 67")).toBe("+79991234567");
    expect(normalizeRuPhoneE164("8 800 555 35 35")).toBe("+78005553535");
  });
});
