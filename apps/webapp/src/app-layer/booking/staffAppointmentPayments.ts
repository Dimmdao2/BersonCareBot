import type { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { loadStaffAppointmentPaymentSummary } from './staffAppointmentPaymentSummary';

type StaffAppointmentPaymentsDeps = Pick<
  ReturnType<typeof buildAppDeps>,
  'patientBooking' | 'patientPayments' | 'payments'
>;

type PaymentStateInput = {
  organizationId: string;
  appointmentId: string;
  platformUserId: string;
};

export type StaffAppointmentPaymentState = {
  summary: Awaited<ReturnType<typeof loadStaffAppointmentPaymentSummary>>;
  totalMinor: number | null;
  manualPaidMinor: number;
  remainingMinor: number | null;
};

export type StaffAppointmentPaymentAction = 'cash' | 'link';

/**
 * Coordinates the existing payments share calculation with the patient-payment ledger.
 * This belongs in app-layer rather than either module: neither module may depend on the other,
 * and parameterizing one with the other's port would reverse that boundary.
 */
export function createStaffAppointmentPaymentsService(deps: StaffAppointmentPaymentsDeps) {
  async function getPaymentState(input: PaymentStateInput): Promise<StaffAppointmentPaymentState> {
    if (!deps.payments) throw new Error('payments_unavailable');
    const [summary, booking, manual] = await Promise.all([
      loadStaffAppointmentPaymentSummary(deps, input.appointmentId, input.organizationId),
      deps.patientBooking.getBookingByCanonicalAppointment(input.appointmentId),
      deps.patientPayments.listAppointmentPayments(input.appointmentId, input.platformUserId),
    ]);
    const totalMinor = booking?.priceMinorSnapshot ?? null;
    const capturedMinor =
      summary?.payment?.status === 'succeeded' ? summary.payment.amountMinor : 0;
    const manualPaidMinor = manual
      .filter((payment) => payment.status === 'paid')
      .reduce((sum, payment) => sum + payment.amountMinor, 0);
    return {
      summary,
      totalMinor,
      manualPaidMinor,
      remainingMinor:
        totalMinor === null ? null : Math.max(0, totalMinor - capturedMinor - manualPaidMinor),
    };
  }

  async function createPayment(
    input: PaymentStateInput & {
      action: StaffAppointmentPaymentAction;
      createdBy: string;
      returnUrl: string;
    },
  ) {
    const payments = deps.payments;
    if (!payments) throw new Error('payments_unavailable');
    const state = await getPaymentState(input);
    if (!state.summary || state.totalMinor === null || state.totalMinor <= 0) {
      return { ok: false as const, error: 'appointment_amount_unavailable' as const };
    }
    if (state.remainingMinor === null || state.remainingMinor === 0) {
      return { ok: false as const, error: 'already_paid' as const };
    }
    const booking = await deps.patientBooking.getBookingByCanonicalAppointment(input.appointmentId);
    if (!booking) return { ok: false as const, error: 'appointment_amount_unavailable' as const };

    if (input.action === 'cash') {
      const payment = await deps.patientPayments.addCashPayment({
        organizationId: input.organizationId,
        patientUserId: input.platformUserId,
        appointmentId: input.appointmentId,
        amountMinor: state.remainingMinor,
        currency: 'RUB',
        service: booking.serviceTitleSnapshot ?? null,
        comment: 'Оплачено наличными в карточке записи',
        idempotencyKey: `staff-appointment-cash:${input.appointmentId}:${state.remainingMinor}`,
        createdBy: input.createdBy,
      });
      return { ok: true as const, payment, remainingMinor: 0 };
    }

    const intent = await payments.createAppointmentPaymentIntent({
      organizationId: input.organizationId,
      appointmentId: input.appointmentId,
      platformUserId: input.platformUserId,
      amountMinor: state.remainingMinor,
      currency: 'RUB',
      idempotencyKey: `staff-appointment-link:${input.appointmentId}:${state.remainingMinor}`,
      returnUrl: input.returnUrl,
    });
    if (!intent.checkoutUrl) throw new Error('payment_link_unavailable');
    return {
      ok: true as const,
      paymentLink: intent.checkoutUrl,
      remainingMinor: state.remainingMinor,
    };
  }

  return { getPaymentState, createPayment };
}
