import type { BookingPoliciesPort } from './ports';
import {
  DEFAULT_BOOKING_POLICY,
  type BookingPolicy,
  type PolicyAppointmentContext,
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
    getBookingPolicy: (organizationId: string) => port.getBookingPolicy(organizationId),
    async upsertBookingPolicy(input: Parameters<BookingPoliciesPort['upsertBookingPolicy']>[0]) {
      assertBookingWriteClearance();
      return port.upsertBookingPolicy(input);
    },
    resolveBookingPolicy: (ctx: PolicyAppointmentContext) => port.resolveBookingPolicy(ctx),
  };
}

export function withDefaultBookingPolicy(
  policy: BookingPolicy | null,
  organizationId: string,
): BookingPolicy {
  if (policy) return policy;
  return {
    organizationId,
    cancellationPolicyId: null,
    reschedulePolicyId: null,
    title: 'Политика отмены и переноса',
    ...DEFAULT_BOOKING_POLICY,
  };
}

export type BookingPoliciesService = ReturnType<typeof createBookingPoliciesService>;
