import type { PatientBookingService } from '@/modules/patient-booking/ports';
import { prepaymentContextFromBooking } from '@/modules/payments/prepaymentContextFromBooking';
import type { PaymentsService } from '@/modules/payments/service';
import type { AppointmentPaymentSummary } from '@/modules/payments/types';

/** Структурно, а не через `buildAppDeps`: композиционный корень импортирует этот путь чтения. */
type Deps = {
  payments?: PaymentsService | null;
  patientBooking: Pick<PatientBookingService, 'getBookingByCanonicalAppointment'>;
};

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
