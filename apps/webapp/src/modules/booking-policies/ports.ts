import type {
  CancellationPolicy,
  PolicyAppointmentContext,
  PolicyScopeLevel,
  ReschedulePolicy,
} from "./types";

export type UpsertCancellationPolicyInput = {
  id?: string;
  organizationId: string;
  scopeLevel: PolicyScopeLevel;
  scopeEntityId: string | null;
  title: string;
  isActive: boolean;
  freeCancelHoursBefore: number;
  cancellationAllowed: boolean;
  lateCancellationBehavior: CancellationPolicy["lateCancellationBehavior"];
  refundPrepaymentOnLate: string;
  chargePackageSessionOnLate: boolean;
  requiresStaffConfirmation: boolean;
  notifyPatient: boolean;
  notifyStaff: boolean;
  sortOrder: number;
};

export type UpsertReschedulePolicyInput = {
  id?: string;
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
  limitExceededBehavior: ReschedulePolicy["limitExceededBehavior"];
  requiresStaffConfirmation: boolean;
  notifyPatient: boolean;
  notifyStaff: boolean;
  sortOrder: number;
};

export type BookingPoliciesPort = {
  listCancellationPolicies(organizationId: string): Promise<CancellationPolicy[]>;
  listReschedulePolicies(organizationId: string): Promise<ReschedulePolicy[]>;
  upsertCancellationPolicy(input: UpsertCancellationPolicyInput): Promise<CancellationPolicy>;
  upsertReschedulePolicy(input: UpsertReschedulePolicyInput): Promise<ReschedulePolicy>;
  resolveCancellationPolicy(ctx: PolicyAppointmentContext): Promise<CancellationPolicy>;
  resolveReschedulePolicy(ctx: PolicyAppointmentContext): Promise<ReschedulePolicy>;
};
