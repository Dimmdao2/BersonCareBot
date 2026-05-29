import {
  matchesCancellationPolicy,
  matchesReschedulePolicy,
  pickHighestPriorityPolicy,
} from "./policyResolver";
import type { BookingPoliciesPort } from "./ports";
import {
  DEFAULT_CANCELLATION_POLICY,
  DEFAULT_RESCHEDULE_POLICY,
  type CancellationPolicy,
  type PolicyAppointmentContext,
  type ReschedulePolicy,
} from "./types";

export function createBookingPoliciesService(port: BookingPoliciesPort) {
  return {
    listCancellationPolicies: (organizationId: string) => port.listCancellationPolicies(organizationId),
    listReschedulePolicies: (organizationId: string) => port.listReschedulePolicies(organizationId),
    upsertCancellationPolicy: port.upsertCancellationPolicy.bind(port),
    upsertReschedulePolicy: port.upsertReschedulePolicy.bind(port),
    resolveCancellationPolicy: (ctx: PolicyAppointmentContext) => port.resolveCancellationPolicy(ctx),
    resolveReschedulePolicy: (ctx: PolicyAppointmentContext) => port.resolveReschedulePolicy(ctx),
  };
}

export type BookingPoliciesService = ReturnType<typeof createBookingPoliciesService>;

export function withDefaultCancellationPolicy(policy: CancellationPolicy | null, organizationId: string): CancellationPolicy {
  if (policy) return policy;
  return {
    id: "default",
    organizationId,
    scopeLevel: "organization",
    scopeEntityId: organizationId,
    title: "По умолчанию",
    ...DEFAULT_CANCELLATION_POLICY,
  };
}

export function withDefaultReschedulePolicy(policy: ReschedulePolicy | null, organizationId: string): ReschedulePolicy {
  if (policy) return policy;
  return {
    id: "default",
    organizationId,
    scopeLevel: "organization",
    scopeEntityId: organizationId,
    title: "По умолчанию",
    ...DEFAULT_RESCHEDULE_POLICY,
  };
}

export function resolveCancellationFromList(
  policies: CancellationPolicy[],
  ctx: PolicyAppointmentContext,
): CancellationPolicy | null {
  return pickHighestPriorityPolicy(policies, ctx, matchesCancellationPolicy);
}

export function resolveRescheduleFromList(
  policies: ReschedulePolicy[],
  ctx: PolicyAppointmentContext,
): ReschedulePolicy | null {
  return pickHighestPriorityPolicy(policies, ctx, matchesReschedulePolicy);
}
