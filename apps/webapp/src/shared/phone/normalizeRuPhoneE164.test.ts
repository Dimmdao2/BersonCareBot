import { describe, expect, it } from "vitest";
import { normalizeRuPhoneE164 } from "./normalizeRuPhoneE164";

describe("normalizeRuPhoneE164", () => {
  it("normalizes 8… and local 9… to +7…", () => {
    expect(normalizeRuPhoneE164("8 (999) 123-45-67")).toBe("+79991234567");
    expect(normalizeRuPhoneE164("9991234567")).toBe("+79991234567");
  });
});
