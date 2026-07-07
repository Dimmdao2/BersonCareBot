import { describe, expect, it } from "vitest";
import { formatPatientPackageLongLabel, formatPatientPackageShortLabel } from "./display";

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

describe("formatPatientPackageLongLabel", () => {
  it("formats membership number and sold date for package cards", () => {
    expect(formatPatientPackageLongLabel(1, "2026-06-01T00:00:00.000Z")).toBe("аб #001 от 01.06.2026");
    expect(formatPatientPackageLongLabel(1234, "2026-06-02")).toBe("аб #1234 от 02.06.2026");
  });

  it("falls back without inventing a long number", () => {
    expect(formatPatientPackageLongLabel(null, "2026-06-01T00:00:00.000Z")).toBe("аб #— от 01.06.2026");
    expect(formatPatientPackageLongLabel(0, null)).toBe("аб #—");
  });
});
