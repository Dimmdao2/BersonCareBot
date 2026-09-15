import type { PatientPayment } from '@/modules/patient-payments/ports';
import type { PaymentHistoryEventRecord } from '@/modules/payments/types';

export type PaymentTimelineEntry = {
  id: string;
  occurredAt: string;
  kind: 'cash' | 'acquiring' | 'booking_prepayment' | 'booking_refund';
  status: string;
  amountMinor: number | null;
  currency: string;
  description: string | null;
  provider: string | null;
  appointmentId: string | null;
};

function mapPatientPayment(payment: PatientPayment): PaymentTimelineEntry {
  return {
    id: payment.id,
    occurredAt: payment.createdAt,
    kind: payment.kind,
    status: payment.status,
    amountMinor: payment.amountMinor,
    currency: payment.currency,
    description: payment.service ?? payment.comment ?? null,
    provider: payment.provider ?? null,
    appointmentId: payment.visitId ?? null,
  };
}

function mapHistoryEvent(event: PaymentHistoryEventRecord): PaymentTimelineEntry {
  const isRefund = event.eventType.toLowerCase().includes('refund');
  return {
    id: event.id,
    occurredAt: event.occurredAt,
    kind: isRefund ? 'booking_refund' : 'booking_prepayment',
    status: event.status ?? event.eventType,
    amountMinor: event.amountMinor,
    currency: event.currency ?? 'RUB',
    description: event.purpose ?? event.comment ?? null,
    provider: event.providerId ?? null,
    appointmentId: event.appointmentId ?? null,
  };
}

export function buildPaymentTimeline(
  patientPayments: readonly PatientPayment[],
  historyEvents: readonly PaymentHistoryEventRecord[],
): PaymentTimelineEntry[] {
  return [...patientPayments.map(mapPatientPayment), ...historyEvents.map(mapHistoryEvent)].sort((a, b) =>
    b.occurredAt.localeCompare(a.occurredAt),
  );
}

export function summarizePatientPayments(patientPayments: readonly PatientPayment[]) {
  return {
    totalCashMinor: patientPayments
      .filter((payment) => payment.kind === 'cash' && payment.status === 'paid')
      .reduce((sum, payment) => sum + payment.amountMinor, 0),
    totalAcquiringMinor: patientPayments
      .filter((payment) => payment.kind === 'acquiring' && payment.status === 'paid')
      .reduce((sum, payment) => sum + payment.amountMinor, 0),
  };
}
