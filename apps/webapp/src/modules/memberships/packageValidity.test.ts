import { describe, expect, it } from "vitest";
import { isPatientPackageExpired, isPatientPackageWithinValidity } from "./packageValidity";

describe("packageValidity", () => {
  const now = new Date("2026-06-01T12:00:00Z");

  it("isPatientPackageWithinValidity rejects before validFrom", () => {
    expect(
      isPatientPackageWithinValidity(
        { status: "active", validFrom: "2026-07-01T00:00:00Z", validUntil: null },
        now,
      ),
    ).toBe(false);
  });

  it("isPatientPackageWithinValidity rejects after validUntil", () => {
    expect(
      isPatientPackageWithinValidity(
        { status: "active", validFrom: null, validUntil: "2026-05-01T00:00:00Z" },
        now,
      ),
    ).toBe(false);
  });

  it("isPatientPackageExpired is true when validUntil passed", () => {
    expect(
      isPatientPackageExpired(
        { status: "active", validUntil: "2026-05-01T00:00:00Z" },
        now,
      ),
    ).toBe(true);
  });
});
