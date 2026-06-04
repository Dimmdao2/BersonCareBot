import { describe, expect, it } from "vitest";
import { computeAppointmentPackageLinkage } from "./packageSessionLinkage";
import type { PackageUsageRecord } from "./types";

function usage(kind: PackageUsageRecord["usageKind"]): PackageUsageRecord {
  return {
    id: "u1",
    patientPackageId: "pkg",
    patientPackageItemId: "item",
    appointmentId: "appt",
    usageKind: kind,
    quantity: 1,
    comment: null,
    occurredAt: "2026-01-01T00:00:00Z",
  };
}

describe("computeAppointmentPackageLinkage", () => {
  it("detects reserved", () => {
    expect(computeAppointmentPackageLinkage([usage("reserve")])).toBe("reserved");
  });

  it("detects consumed after reserve release+consume", () => {
    expect(
      computeAppointmentPackageLinkage([usage("reserve"), usage("release"), usage("consume")]),
    ).toBe("consumed");
  });

  it("detects refunded", () => {
    expect(
      computeAppointmentPackageLinkage([usage("consume"), usage("refund")]),
    ).toBe("refunded");
  });
});
