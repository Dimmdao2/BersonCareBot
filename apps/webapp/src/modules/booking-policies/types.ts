export type PolicyScopeLevel = "organization" | "specialist" | "service" | "product";

export type LateCancellationBehavior =
  | "penalty"
  | "manual_review"
  | "charge_package"
  | "retain_prepayment"
  | "refund_prepayment";

export type RescheduleLimitBehavior = "manual_request" | "deny";

export type CancellationDecisionType =
  | "free"
  | "penalized"
  | "package_charged"
  | "no_package_charge"
  | "retain_prepayment"
  | "refund_prepayment"
  | "custom";

export type AppointmentActorType = "patient" | "specialist" | "admin" | "system";

export type CancellationPolicy = {
  id: string;
  organizationId: string;
  scopeLevel: PolicyScopeLevel;
  scopeEntityId: string | null;
  title: string;
  isActive: boolean;
  freeCancelHoursBefore: number;
  cancellationAllowed: boolean;
  lateCancellationBehavior: LateCancellationBehavior;
  refundPrepaymentOnLate: string;
  chargePackageSessionOnLate: boolean;
  requiresStaffConfirmation: boolean;
  notifyPatient: boolean;
  notifyStaff: boolean;
  sortOrder: number;
};

export type ReschedulePolicy = {
  id: string;
  organizationId: string;
  scopeLevel: PolicyScopeLevel;
  scopeEntityId: string | null;
  title: string;
  isActive: boolean;
  selfRescheduleHoursBefore: number;
  maxSelfReschedules: number;
  allowDifferentBranch: boolean;
  allowDifferentCity: boolean;
  allowDifferentSpecialist: boolean;
  allowDifferentService: boolean;
  limitExceededBehavior: RescheduleLimitBehavior;
  requiresStaffConfirmation: boolean;
  notifyPatient: boolean;
  notifyStaff: boolean;
  sortOrder: number;
};

export type PolicyAppointmentContext = {
  organizationId: string;
  specialistId: string | null;
  serviceId: string | null;
  productId?: string | null;
};

export type RescheduleHistoryEntry = {
  actorType: AppointmentActorType;
  createdAt: string;
};

export type CancellationEligibility = {
  allowed: boolean;
  isFree: boolean;
  requiresStaffConfirmation: boolean;
  decisionType: CancellationDecisionType;
  reasonCode:
    | "free"
    | "late"
    | "forfeited_by_reschedule"
    | "not_allowed"
    | "staff_confirmation_required"
    | "manual_override";
  referenceStartAt: string;
  hoursUntilReference: number;
};

export type RescheduleEligibility = {
  allowed: boolean;
  reasonCode:
    | "allowed"
    | "too_late"
    | "limit_exceeded"
    | "not_allowed"
    | "staff_confirmation_required"
    | "change_not_allowed"
    | "manual_override";
  requiresStaffConfirmation: boolean;
  limitExceededBehavior: RescheduleLimitBehavior | null;
  remainingSelfReschedules: number;
};

export const DEFAULT_CANCELLATION_POLICY: Omit<CancellationPolicy, "id" | "organizationId" | "scopeLevel" | "scopeEntityId" | "title"> = {
  isActive: true,
  freeCancelHoursBefore: 72,
  cancellationAllowed: true,
  lateCancellationBehavior: "manual_review",
  refundPrepaymentOnLate: "manual",
  chargePackageSessionOnLate: false,
  requiresStaffConfirmation: false,
  notifyPatient: true,
  notifyStaff: true,
  sortOrder: 0,
};

export const DEFAULT_RESCHEDULE_POLICY: Omit<ReschedulePolicy, "id" | "organizationId" | "scopeLevel" | "scopeEntityId" | "title"> = {
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
