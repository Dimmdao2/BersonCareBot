import { describe, expect, it } from "vitest";
import {
  evaluateCancellationEligibility,
  evaluateRescheduleEligibility,
  pickHighestPriorityPolicy,
} from "./policyResolver";
import type { CancellationPolicy, PolicyAppointmentContext, ReschedulePolicy } from "./types";

const baseCtx: PolicyAppointmentContext = {
  organizationId: "org-1",
  specialistId: "spec-1",
  serviceId: "svc-1",
};

function cancelPolicy(partial: Partial<CancellationPolicy> & Pick<CancellationPolicy, "id" | "scopeLevel">): CancellationPolicy {
  return {
    organizationId: "org-1",
    scopeEntityId: partial.scopeLevel === "organization" ? "org-1" : baseCtx.specialistId,
    title: "t",
    isActive: true,
    freeCancelHoursBefore: 72,
    cancellationAllowed: true,
    lateCancellationBehavior: "penalty",
    refundPrepaymentOnLate: "manual",
    chargePackageSessionOnLate: false,
    requiresStaffConfirmation: false,
    notifyPatient: true,
    notifyStaff: true,
    sortOrder: 0,
    ...partial,
  };
}

describe("pickHighestPriorityPolicy", () => {
  it("prefers service over organization", () => {
    const org = cancelPolicy({ id: "o", scopeLevel: "organization" });
    const svc = cancelPolicy({ id: "s", scopeLevel: "service", scopeEntityId: "svc-1" });
    const picked = pickHighestPriorityPolicy([org, svc], baseCtx, (p, c) => {
      if (p.scopeLevel === "organization") return true;
      return p.scopeEntityId === c.serviceId;
    });
    expect(picked?.id).toBe("s");
  });
});

describe("evaluateCancellationEligibility §8.4 anti-bypass", () => {
  const referenceStart = "2026-06-10T10:00:00.000Z";
  const policy = cancelPolicy({ id: "p", scopeLevel: "organization", freeCancelHoursBefore: 72 });

  it("allows free cancel when within window from original and no forfeiting reschedule", () => {
    const now = new Date("2026-06-07T10:00:00.000Z");
    const result = evaluateCancellationEligibility({
      referenceStartAt: referenceStart,
      policy,
      rescheduleHistory: [],
      now,
    });
    expect(result.isFree).toBe(true);
    expect(result.reasonCode).toBe("free");
  });

  it("denies free cancel after reschedule when original was already inside late window", () => {
    const rescheduleAt = "2026-06-09T10:00:00.000Z";
    const now = new Date("2026-06-15T10:00:00.000Z");
    const result = evaluateCancellationEligibility({
      referenceStartAt: referenceStart,
      policy,
      rescheduleHistory: [{ actorType: "patient", createdAt: rescheduleAt }],
      now,
    });
    expect(result.isFree).toBe(false);
    expect(result.reasonCode).toBe("forfeited_by_reschedule");
  });

  it("would allow free cancel by new date alone but forfeiture blocks it", () => {
    const rescheduleAt = "2026-06-09T10:00:00.000Z";
    const newStart = "2026-06-20T10:00:00.000Z";
    const now = new Date("2026-06-12T10:00:00.000Z");
    const byNewDate = evaluateCancellationEligibility({
      referenceStartAt: newStart,
      policy,
      rescheduleHistory: [],
      now,
    });
    expect(byNewDate.isFree).toBe(true);
    const withHistory = evaluateCancellationEligibility({
      referenceStartAt: referenceStart,
      policy,
      rescheduleHistory: [{ actorType: "patient", createdAt: rescheduleAt }],
      now,
    });
    expect(withHistory.isFree).toBe(false);
  });
});

describe("evaluateRescheduleEligibility", () => {
  const policy: ReschedulePolicy = {
    id: "r",
    organizationId: "org-1",
    scopeLevel: "organization",
    scopeEntityId: "org-1",
    title: "t",
    isActive: true,
    selfRescheduleHoursBefore: 48,
    maxSelfReschedules: 1,
    allowDifferentBranch: false,
    allowDifferentCity: false,
    allowDifferentSpecialist: false,
    allowDifferentService: false,
    limitExceededBehavior: "manual_request",
    requiresStaffConfirmation: false,
    notifyPatient: true,
    notifyStaff: true,
    sortOrder: 0,
  };

  it("blocks when reschedule limit exceeded", () => {
    const result = evaluateRescheduleEligibility({
      currentStartAt: "2026-06-10T10:00:00.000Z",
      policy,
      rescheduleCount: 1,
      now: new Date("2026-06-07T10:00:00.000Z"),
    });
    expect(result.allowed).toBe(false);
    expect(result.reasonCode).toBe("limit_exceeded");
  });
});
