export type PolicyScopeLevel = 'organization' | 'specialist' | 'service' | 'product';

export type LateCancellationBehavior =
  | 'penalty'
  | 'manual_review'
  | 'charge_package'
  | 'retain_prepayment'
  | 'refund_prepayment';

export type RescheduleLimitBehavior = 'manual_request' | 'deny';

export type CancellationDecisionType =
  | 'free'
  | 'penalized'
  | 'package_charged'
  | 'no_package_charge'
  | 'retain_prepayment'
  | 'refund_prepayment'
  | 'custom';

export type AppointmentActorType = 'patient' | 'specialist' | 'admin' | 'system';

/**
 * One organization policy governs both patient cancellation and patient rescheduling.
 * The two actions can be enabled independently; the cutoff and late consequence are shared.
 * `cancellationPolicyId` and `reschedulePolicyId` are persistence details while the two
 * historical tables are being retained for backward-compatible appointment snapshots.
 */
export type BookingPolicy = {
  organizationId: string;
  cancellationPolicyId: string | null;
  reschedulePolicyId: string | null;
  title: string;
  cancellationAllowed: boolean;
  rescheduleAllowed: boolean;
  freeChangeHoursBefore: number;
  lateChangeBehavior: LateCancellationBehavior;
  refundPrepaymentOnLate: string;
  chargePackageSessionOnLate: boolean;
  requiresStaffConfirmation: boolean;
  notifyPatient: boolean;
  notifyStaff: boolean;
};

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

export type BookingAction = 'cancellation' | 'reschedule';

export type BookingActionEligibility = {
  action: BookingAction;
  allowed: boolean;
  isFree: boolean;
  requiresStaffConfirmation: boolean;
  decisionType: CancellationDecisionType;
  reasonCode: 'free' | 'late' | 'not_allowed' | 'manual_override';
  referenceStartAt: string;
  hoursUntilReference: number;
};

export const DEFAULT_BOOKING_POLICY: Omit<
  BookingPolicy,
  'organizationId' | 'cancellationPolicyId' | 'reschedulePolicyId' | 'title'
> = {
  cancellationAllowed: true,
  rescheduleAllowed: true,
  freeChangeHoursBefore: 72,
  lateChangeBehavior: 'manual_review',
  refundPrepaymentOnLate: 'manual',
  chargePackageSessionOnLate: false,
  requiresStaffConfirmation: false,
  notifyPatient: true,
  notifyStaff: true,
};
