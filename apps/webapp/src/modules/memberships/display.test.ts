import { describe, expect, it } from "vitest";
import { formatPatientPackageShortLabel } from "./display";

describe("formatPatientPackageShortLabel", () => {
  it("formats stable short membership numbers", () => {
    expect(formatPatientPackageShortLabel(1)).toBe("аб.#001");
    expect(formatPatientPackageShortLabel(12)).toBe("аб.#012");
    expect(formatPatientPackageShortLabel(1234)).toBe("аб.#1234");
  });

  it("falls back without inventing a number", () => {
    expect(formatPatientPackageShortLabel(null)).toBe("аб.");
    expect(formatPatientPackageShortLabel(undefined)).toBe("аб.");
    expect(formatPatientPackageShortLabel(0)).toBe("аб.");
    expect(formatPatientPackageShortLabel(-1)).toBe("аб.");
    expect(formatPatientPackageShortLabel(Number.NaN)).toBe("аб.");
  });
});
