import { describe, expect, it } from "vitest";
import { isValidRuMobileNormalized } from "./phoneValidation";

describe("isValidRuMobileNormalized", () => {
  it("accepts +7 and exactly 10 digits after", () => {
    expect(isValidRuMobileNormalized("+79991234567")).toBe(true);
  });

  it("rejects wrong length", () => {
    expect(isValidRuMobileNormalized("+7999123456")).toBe(false);
    expect(isValidRuMobileNormalized("+799912345678")).toBe(false);
  });

  it("rejects non-+7", () => {
    expect(isValidRuMobileNormalized("+19991234567")).toBe(false);
  });
});
