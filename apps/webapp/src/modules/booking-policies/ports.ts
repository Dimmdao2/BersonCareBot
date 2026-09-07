import type { BookingPolicy, PolicyAppointmentContext } from './types';

export type UpsertBookingPolicyInput = Omit<BookingPolicy, 'cancellationPolicyId' | 'reschedulePolicyId'> & {
  cancellationPolicyId?: string | null;
  reschedulePolicyId?: string | null;
};

export type BookingPoliciesPort = {
  getBookingPolicy(organizationId: string): Promise<BookingPolicy>;
  upsertBookingPolicy(input: UpsertBookingPolicyInput): Promise<BookingPolicy>;
  resolveBookingPolicy(ctx: PolicyAppointmentContext): Promise<BookingPolicy>;
};
