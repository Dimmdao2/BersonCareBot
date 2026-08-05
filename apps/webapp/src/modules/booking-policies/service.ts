import {
  matchesCancellationPolicy,
  matchesReschedulePolicy,
  pickHighestPriorityPolicy,
} from './policyResolver';
import type { BookingPoliciesPort } from './ports';
import {
  DEFAULT_CANCELLATION_POLICY,
  DEFAULT_RESCHEDULE_POLICY,
  type CancellationPolicy,
  type PolicyAppointmentContext,
  type ReschedulePolicy,
} from './types';

type BookingPoliciesServiceDependencies = {
  /**
   * 3.2: physically refuses a `booking` write unless a passing mutation decision already ran in
   * this request (injected from `buildAppDeps.ts` as `assertMechanicWriteClearance`).
   */
  assertWriteClearance?: (mechanic: 'booking') => void;
};

export function createBookingPoliciesService(
  port: BookingPoliciesPort,
  dependencies: BookingPoliciesServiceDependencies = {},
) {
  function assertBookingWriteClearance(): void {
    dependencies.assertWriteClearance?.('booking');
  }

  return {
    listCancellationPolicies: (organizationId: string) =>
      port.listCancellationPolicies(organizationId),
    listReschedulePolicies: (organizationId: string) => port.listReschedulePolicies(organizationId),
    async upsertCancellationPolicy(
      input: Parameters<BookingPoliciesPort['upsertCancellationPolicy']>[0],
    ) {
      assertBookingWriteClearance();
      return port.upsertCancellationPolicy(input);
    },
    async upsertReschedulePolicy(
      input: Parameters<BookingPoliciesPort['upsertReschedulePolicy']>[0],
    ) {
      assertBookingWriteClearance();
      return port.upsertReschedulePolicy(input);
    },
    resolveCancellationPolicy: (ctx: PolicyAppointmentContext) =>
      port.resolveCancellationPolicy(ctx),
    resolveReschedulePolicy: (ctx: PolicyAppointmentContext) => port.resolveReschedulePolicy(ctx),
  };
}

export type BookingPoliciesService = ReturnType<typeof createBookingPoliciesService>;

export function withDefaultCancellationPolicy(
  policy: CancellationPolicy | null,
  organizationId: string,
): CancellationPolicy {
  if (policy) return policy;
  return {
    id: 'default',
    organizationId,
    scopeLevel: 'organization',
    scopeEntityId: organizationId,
    title: 'По умолчанию',
    ...DEFAULT_CANCELLATION_POLICY,
  };
}

export function withDefaultReschedulePolicy(
  policy: ReschedulePolicy | null,
  organizationId: string,
): ReschedulePolicy {
  if (policy) return policy;
  return {
    id: 'default',
    organizationId,
    scopeLevel: 'organization',
    scopeEntityId: organizationId,
    title: 'По умолчанию',
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
