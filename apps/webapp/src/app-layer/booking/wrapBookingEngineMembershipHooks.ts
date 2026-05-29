import type { createBookingEngineService } from "@/modules/booking-engine/service";
import type { MembershipsService } from "@/modules/memberships/service";

type BookingEngineService = NonNullable<ReturnType<typeof createBookingEngineService>>;

/** After status transition, auto-consume package reserve when deduction mode requires it. */
export function wrapBookingEngineMembershipHooks(
  bookingEngine: BookingEngineService,
  memberships: MembershipsService,
): void {
  const baseTransition = bookingEngine.transitionAppointmentStatus.bind(bookingEngine);
  bookingEngine.transitionAppointmentStatus = async (input) => {
    const appt = await baseTransition(input);
    if (input.toStatus === "visit_confirmed" || input.toStatus === "completed") {
      await memberships.onVisitConfirmed(appt.id, appt.organizationId);
    }
    return appt;
  };
}
