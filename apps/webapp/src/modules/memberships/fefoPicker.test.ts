import { describe, expect, it } from "vitest";
import { pickPatientPackageFefo } from "./fefoPicker";
import type { PatientPackageListItem } from "./types";

function pkg(
  id: string,
  validUntil: string | null,
  createdAt: string,
  serviceId: string,
  remaining: number,
): PatientPackageListItem {
  return {
    id,
    organizationId: "org",
    platformUserId: "user",
    subscriptionPackageId: null,
    status: "active",
    title: id,
    priceMinor: 0,
    currency: "RUB",
    validityDays: null,
    validFrom: null,
    validUntil,
    deductionMode: "auto_on_visit_confirmed",
    paymentIntentId: null,
    paymentRef: null,
    soldAt: null,
    paidAmountMinor: null,
    paidCurrency: null,
    createdAt,
    notes: null,
    items: [{ id: `i-${id}`, serviceId, quantityInitial: 5, sortOrder: 0 }],
    balance: {
      patientPackageId: id,
      status: "active",
      items: [
        {
          patientPackageItemId: `i-${id}`,
          serviceId,
          quantityInitial: 5,
          reserved: 0,
          consumed: 0,
          released: 0,
          penalty: 0,
          refunded: 0,
          remaining,
          displayRemaining: remaining,
        },
      ],
    },
  };
}

describe("pickPatientPackageFefo", () => {
  it("picks nearest validUntil first", () => {
    const a = pkg("a", "2026-12-01T00:00:00Z", "2026-01-01T00:00:00Z", "svc", 2);
    const b = pkg("b", "2026-06-01T00:00:00Z", "2026-01-02T00:00:00Z", "svc", 2);
    expect(pickPatientPackageFefo([a, b], "svc")?.id).toBe("b");
  });

  it("prefers packages with deadline over open-ended", () => {
    const withDeadline = pkg("d", "2026-08-01T00:00:00Z", "2026-01-01T00:00:00Z", "svc", 1);
    const open = pkg("o", null, "2026-01-01T00:00:00Z", "svc", 1);
    expect(pickPatientPackageFefo([open, withDeadline], "svc")?.id).toBe("d");
  });

  it("tie-breaks by createdAt then id within same validUntil", () => {
    const older = pkg("pkg-a", "2026-12-01T00:00:00Z", "2026-01-01T00:00:00Z", "svc", 1);
    const newer = pkg("pkg-b", "2026-12-01T00:00:00Z", "2026-01-02T00:00:00Z", "svc", 1);
    expect(pickPatientPackageFefo([newer, older], "svc")?.id).toBe("pkg-a");
  });
});
