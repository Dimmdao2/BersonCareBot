import type { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { prepaymentContextFromBooking } from "@/modules/payments/prepaymentContextFromBooking";
import type { AppointmentPaymentSummary } from "@/modules/payments/types";

type Deps = Pick<ReturnType<typeof buildAppDeps>, "payments" | "patientBooking">;

export async function loadStaffAppointmentPaymentSummary(
  deps: Deps,
  appointmentId: string,
  organizationId: string,
): Promise<AppointmentPaymentSummary | null> {
  if (!deps.payments) return null;
  const booking = await deps.patientBooking.getBookingByCanonicalAppointment(appointmentId);
  return deps.payments.getAppointmentPaymentSummary(
    appointmentId,
    organizationId,
    undefined,
    prepaymentContextFromBooking(booking),
  );
}
