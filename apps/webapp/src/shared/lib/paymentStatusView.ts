/**
 * Успешное тело ответа `/api/booking/payment-status` — ровно то, что рисуют экраны оплаты.
 *
 * Живёт здесь, рядом с классификаторами, потому что экранов оплаты ДВА: кабинетный
 * (`app/app/patient/booking/pay`) и публичный (`app/book/pay`, он же адрес возврата от провайдера).
 * Независимый аудит S9 поймал, во что обходится их разъезд: маршрут сузил ответ, кабинетный экран
 * перевели, а публичный остался читать `summary.intent.*` — и молча показывал «Платёжный провайдер
 * не настроен» вместо суммы и кнопки, а успешную оплату не распознавал вовсе. `typecheck` при этом
 * молчал, потому что КАЖДЫЙ экран описывал тело ответа своим локальным приведением. Один тип на
 * маршрут и оба экрана делает следующее такое сужение ошибкой компиляции, а не молчаливой потерей
 * денег.
 */
export type BookingPaymentStatusOk = {
  intentId: string | null;
  amountMinor: number | null;
  currency: string | null;
  intentStatus: string | null;
  /** Всегда НАШ адрес проверки счёта (`/book/pay/{intentId}`), никогда домен провайдера. */
  checkoutUrl: string | null;
  paymentDeadlineAt: string | null;
  appointmentStatus: string;
};

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
