import type {
  CancellationDecisionType,
  CancellationEligibility,
  CancellationPolicy,
  PolicyAppointmentContext,
  PolicyScopeLevel,
  RescheduleEligibility,
  RescheduleHistoryEntry,
  ReschedulePolicy,
} from "./types";

const SCOPE_PRIORITY: Record<PolicyScopeLevel, number> = {
  product: 4,
  service: 3,
  specialist: 2,
  organization: 1,
};

export function pickHighestPriorityPolicy<T extends { scopeLevel: PolicyScopeLevel; isActive: boolean }>(
  policies: T[],
  ctx: PolicyAppointmentContext,
  matches: (policy: T, ctx: PolicyAppointmentContext) => boolean,
): T | null {
  const active = policies.filter((p) => p.isActive && matches(p, ctx));
  if (active.length === 0) return null;
  return active.sort((a, b) => SCOPE_PRIORITY[b.scopeLevel] - SCOPE_PRIORITY[a.scopeLevel])[0] ?? null;
}

export function matchesCancellationPolicy(policy: CancellationPolicy, ctx: PolicyAppointmentContext): boolean {
  if (policy.scopeLevel === "organization") {
    return policy.scopeEntityId === ctx.organizationId || policy.scopeEntityId === null;
  }
  if (policy.scopeLevel === "specialist") return policy.scopeEntityId === ctx.specialistId;
  if (policy.scopeLevel === "service") return policy.scopeEntityId === ctx.serviceId;
  if (policy.scopeLevel === "product") return policy.scopeEntityId === (ctx.productId ?? null);
  return false;
}

export function matchesReschedulePolicy(policy: ReschedulePolicy, ctx: PolicyAppointmentContext): boolean {
  if (policy.scopeLevel === "organization") {
    return policy.scopeEntityId === ctx.organizationId || policy.scopeEntityId === null;
  }
  if (policy.scopeLevel === "specialist") return policy.scopeEntityId === ctx.specialistId;
  if (policy.scopeLevel === "service") return policy.scopeEntityId === ctx.serviceId;
  if (policy.scopeLevel === "product") return policy.scopeEntityId === (ctx.productId ?? null);
  return false;
}

export function hoursUntil(isoStart: string, now: Date): number {
  return (new Date(isoStart).getTime() - now.getTime()) / 3_600_000;
}

/** §8.4: free cancel is measured from original_start_at, forfeited if rescheduled when already late. */
export function evaluateCancellationEligibility(input: {
  referenceStartAt: string;
  policy: Pick<
    CancellationPolicy,
    | "cancellationAllowed"
    | "freeCancelHoursBefore"
    | "requiresStaffConfirmation"
    | "lateCancellationBehavior"
    | "chargePackageSessionOnLate"
  >;
  rescheduleHistory: RescheduleHistoryEntry[];
  now?: Date;
  manualOverride?: { allowed: boolean; decisionType: CancellationDecisionType };
}): CancellationEligibility {
  const now = input.now ?? new Date();
  const referenceStartAt = input.referenceStartAt;
  const hours = hoursUntil(referenceStartAt, now);

  if (input.manualOverride) {
    return {
      allowed: input.manualOverride.allowed,
      isFree: input.manualOverride.decisionType === "free",
      requiresStaffConfirmation: false,
      decisionType: input.manualOverride.decisionType,
      reasonCode: "manual_override",
      referenceStartAt,
      hoursUntilReference: hours,
    };
  }

  if (!input.policy.cancellationAllowed) {
    return {
      allowed: false,
      isFree: false,
      requiresStaffConfirmation: false,
      decisionType: "penalized",
      reasonCode: "not_allowed",
      referenceStartAt,
      hoursUntilReference: hours,
    };
  }

  for (const entry of input.rescheduleHistory) {
    const hoursAtReschedule = hoursUntil(referenceStartAt, new Date(entry.createdAt));
    if (hoursAtReschedule < input.policy.freeCancelHoursBefore) {
      return {
        allowed: true,
        isFree: false,
        requiresStaffConfirmation: input.policy.requiresStaffConfirmation,
        decisionType: resolveLateCancellationDecisionType(input.policy),
        reasonCode: "forfeited_by_reschedule",
        referenceStartAt,
        hoursUntilReference: hours,
      };
    }
  }

  if (hours >= input.policy.freeCancelHoursBefore) {
    return {
      allowed: true,
      isFree: true,
      requiresStaffConfirmation: false,
      decisionType: "free",
      reasonCode: "free",
      referenceStartAt,
      hoursUntilReference: hours,
    };
  }

  return {
    allowed: true,
    isFree: false,
    requiresStaffConfirmation: input.policy.requiresStaffConfirmation,
    decisionType: resolveLateCancellationDecisionType(input.policy),
    reasonCode: "late",
    referenceStartAt,
    hoursUntilReference: hours,
  };
}

function mapLateBehaviorToDecision(
  behavior: CancellationPolicy["lateCancellationBehavior"],
): CancellationDecisionType {
  if (behavior === "charge_package") return "package_charged";
  if (behavior === "retain_prepayment") return "retain_prepayment";
  if (behavior === "refund_prepayment") return "refund_prepayment";
  if (behavior === "penalty") return "penalized";
  return "penalized";
}

function resolveLateCancellationDecisionType(
  policy: Pick<CancellationPolicy, "lateCancellationBehavior" | "chargePackageSessionOnLate">,
): CancellationDecisionType {
  if (policy.chargePackageSessionOnLate) return "package_charged";
  return mapLateBehaviorToDecision(policy.lateCancellationBehavior);
}

export function evaluateRescheduleEligibility(input: {
  currentStartAt: string;
  policy: Pick<
    ReschedulePolicy,
    | "selfRescheduleHoursBefore"
    | "maxSelfReschedules"
    | "requiresStaffConfirmation"
    | "limitExceededBehavior"
    | "allowDifferentBranch"
    | "allowDifferentCity"
    | "allowDifferentSpecialist"
    | "allowDifferentService"
  >;
  rescheduleCount: number;
  now?: Date;
  change?: {
    branchId?: string | null;
    cityCode?: string | null;
    specialistId?: string | null;
    serviceId?: string | null;
  };
  current?: {
    branchId?: string | null;
    cityCode?: string | null;
    specialistId?: string | null;
    serviceId?: string | null;
  };
  manualOverride?: boolean;
}): RescheduleEligibility {
  const now = input.now ?? new Date();
  const hours = hoursUntil(input.currentStartAt, now);
  const remaining = Math.max(0, input.policy.maxSelfReschedules - input.rescheduleCount);

  if (input.manualOverride) {
    return {
      allowed: true,
      reasonCode: "manual_override",
      requiresStaffConfirmation: false,
      limitExceededBehavior: null,
      remainingSelfReschedules: remaining,
    };
  }

  if (input.change && input.current) {
    if (!input.policy.allowDifferentBranch && input.change.branchId && input.change.branchId !== input.current.branchId) {
      return {
        allowed: false,
        reasonCode: "change_not_allowed",
        requiresStaffConfirmation: false,
        limitExceededBehavior: null,
        remainingSelfReschedules: remaining,
      };
    }
    if (!input.policy.allowDifferentCity && input.change.cityCode && input.change.cityCode !== input.current.cityCode) {
      return {
        allowed: false,
        reasonCode: "change_not_allowed",
        requiresStaffConfirmation: false,
        limitExceededBehavior: null,
        remainingSelfReschedules: remaining,
      };
    }
    if (
      !input.policy.allowDifferentSpecialist &&
      input.change.specialistId &&
      input.change.specialistId !== input.current.specialistId
    ) {
      return {
        allowed: false,
        reasonCode: "change_not_allowed",
        requiresStaffConfirmation: false,
        limitExceededBehavior: null,
        remainingSelfReschedules: remaining,
      };
    }
    if (!input.policy.allowDifferentService && input.change.serviceId && input.change.serviceId !== input.current.serviceId) {
      return {
        allowed: false,
        reasonCode: "change_not_allowed",
        requiresStaffConfirmation: false,
        limitExceededBehavior: null,
        remainingSelfReschedules: remaining,
      };
    }
  }

  if (hours < input.policy.selfRescheduleHoursBefore) {
    return {
      allowed: false,
      reasonCode: "too_late",
      requiresStaffConfirmation: input.policy.requiresStaffConfirmation,
      limitExceededBehavior: null,
      remainingSelfReschedules: remaining,
    };
  }

  if (remaining <= 0) {
    return {
      allowed: false,
      reasonCode: "limit_exceeded",
      requiresStaffConfirmation: input.policy.requiresStaffConfirmation,
      limitExceededBehavior: input.policy.limitExceededBehavior,
      remainingSelfReschedules: 0,
    };
  }

  return {
    allowed: true,
    reasonCode: "allowed",
    requiresStaffConfirmation: input.policy.requiresStaffConfirmation,
    limitExceededBehavior: null,
    remainingSelfReschedules: remaining,
  };
}

export function freeCancellationAvailableAfterReschedule(input: {
  referenceStartAt: string;
  policy: Pick<CancellationPolicy, "freeCancelHoursBefore">;
  at: Date;
}): boolean {
  return hoursUntil(input.referenceStartAt, input.at) >= input.policy.freeCancelHoursBefore;
}
