/** Mirrors `PAYMENT_INTENT_STATUSES` (apps/webapp/db/schema/bookingPayments.ts): 'pending' |
 * 'processing' | 'succeeded' | 'failed' | 'cancelled'. Payment screens only ever need to tell
 * these three apart to pick which of the three return-screen states to render. */
export type PaymentStatusView = 'succeeded' | 'failed' | 'pending';

export function classifyPaymentIntentStatus(status: string | null | undefined): PaymentStatusView {
  if (status === 'succeeded') return 'succeeded';
  if (status === 'failed' || status === 'cancelled') return 'failed';
  return 'pending';
}
