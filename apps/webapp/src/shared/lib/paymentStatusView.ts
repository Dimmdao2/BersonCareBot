/** Mirrors `PAYMENT_INTENT_STATUSES` (apps/webapp/db/schema/bookingPayments.ts): 'pending' |
 * 'processing' | 'succeeded' | 'failed' | 'cancelled'. Payment screens only ever need to tell
 * these three apart to pick which of the three return-screen states to render. */
export type PaymentStatusView = 'succeeded' | 'failed' | 'pending';

export function classifyPaymentIntentStatus(status: string | null | undefined): PaymentStatusView {
  if (status === 'succeeded') return 'succeeded';
  if (status === 'failed' || status === 'cancelled') return 'failed';
  return 'pending';
}

/**
 * Чем стала запись, пока счёт висит в `pending` (`APPOINTMENT_STATUSES`,
 * `@/modules/booking-engine/types`). Онлайн-счёт переживает свою запись: оплату наличными у врача
 * (`app.settle_appointment_cash_prepayment`) намерение не трогает вовсе, поэтому «счёт не оплачен»
 * и «запись отменена» — РАЗНЫЕ вещи, и сказать пациенту «бронирование отменено» можно только про
 * по-настоящему отменённую запись.
 */
export type PrepaymentBookingView = 'awaiting' | 'cancelled' | 'settled';

const CANCELLED_APPOINTMENT_STATUSES = new Set([
  'cancelled_by_patient',
  'cancelled_by_specialist',
  'late_cancellation',
  'no_show',
]);

export function classifyPrepaymentBookingStatus(
  appointmentStatus: string | null | undefined,
): PrepaymentBookingView {
  // Статус ещё не доехал — считаем, что оплаты по-прежнему ждут: экран оплаты остаётся рабочим.
  if (!appointmentStatus) return 'awaiting';
  if (appointmentStatus === 'awaiting_payment' || appointmentStatus === 'created') return 'awaiting';
  if (CANCELLED_APPOINTMENT_STATUSES.has(appointmentStatus)) return 'cancelled';
  // `paid`, `confirmed`, `charged_to_package`, `completed` и прочее живое: платить уже не надо.
  return 'settled';
}
