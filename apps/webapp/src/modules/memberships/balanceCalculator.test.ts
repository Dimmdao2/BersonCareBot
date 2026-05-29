import { describe, expect, it } from "vitest";
import { computeItemBalances, findItemForService, hasAvailableForService } from "./balanceCalculator";
import type { PackageUsageRecord, PatientPackageItemRecord } from "./types";

const items: PatientPackageItemRecord[] = [
  { id: "i1", serviceId: "s90", quantityInitial: 2, sortOrder: 0 },
  { id: "i2", serviceId: "s60", quantityInitial: 4, sortOrder: 1 },
];

describe("computeItemBalances", () => {
  it("computes remaining from consume and release", () => {
    const usages: PackageUsageRecord[] = [
      {
        id: "u1",
        patientPackageId: "p1",
        patientPackageItemId: "i1",
        appointmentId: "a1",
        usageKind: "consume",
        quantity: 1,
        comment: null,
        occurredAt: "2026-01-01T00:00:00Z",
      },
      {
        id: "u2",
        patientPackageId: "p1",
        patientPackageItemId: "i1",
        appointmentId: "a2",
        usageKind: "release",
        quantity: 1,
        comment: null,
        occurredAt: "2026-01-02T00:00:00Z",
      },
    ];
    const balances = computeItemBalances(items, usages);
    expect(balances[0]?.remaining).toBe(2);
    expect(balances[1]?.remaining).toBe(4);
  });

  it("subtracts reserve from remaining", () => {
    const usages: PackageUsageRecord[] = [
      {
        id: "u1",
        patientPackageId: "p1",
        patientPackageItemId: "i2",
        appointmentId: "a1",
        usageKind: "reserve",
        quantity: 1,
        comment: null,
        occurredAt: "2026-01-01T00:00:00Z",
      },
    ];
    const balances = computeItemBalances(items, usages);
    expect(balances[1]?.remaining).toBe(3);
  });

  it("applies penalty as debit", () => {
    const usages: PackageUsageRecord[] = [
      {
        id: "u1",
        patientPackageId: "p1",
        patientPackageItemId: "i1",
        appointmentId: null,
        usageKind: "penalty",
        quantity: 1,
        comment: null,
        occurredAt: "2026-01-01T00:00:00Z",
      },
    ];
    const balances = computeItemBalances(items, usages);
    expect(balances[0]?.remaining).toBe(1);
  });
});

describe("hasAvailableForService", () => {
  it("returns true when remaining >= quantity", () => {
    const balances = computeItemBalances(items, []);
    expect(hasAvailableForService(balances, "s90", 2)).toBe(true);
    expect(hasAvailableForService(balances, "s90", 3)).toBe(false);
  });
});

describe("findItemForService", () => {
  it("picks first item with remaining", () => {
    const balances = computeItemBalances(items, []);
    const found = findItemForService(items, balances, "s60");
    expect(found?.item.id).toBe("i2");
  });
});
