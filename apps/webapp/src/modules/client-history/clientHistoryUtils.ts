import type { ClientPaymentHistoryRow, ClientTimelineItem, ClientVisitHistoryRow } from './types';

export const PREPAYMENT_EVENT_TYPES = new Set([
  'prepayment_captured',
  'prepayment_retained',
  'prepayment_refunded',
  'prepayment_carried_on_reschedule',
  'package_intent_created',
]);

export const FINAL_PAYMENT_EVENT_TYPES = new Set([
  'payment_captured',
  'payment_succeeded',
  'payment.succeeded',
]);

export const REFUND_EVENT_TYPES = new Set([
  'refund_succeeded',
  'payment_refunded',
  'prepayment_refunded',
]);

export function isPrepaymentEventType(eventType: string): boolean {
  return PREPAYMENT_EVENT_TYPES.has(eventType) || eventType.includes('prepayment');
}

export function isFinalPaymentEventType(eventType: string): boolean {
  if (eventType.includes('prepayment')) return false;
  if (eventType.includes('refund')) return false;
  return (
    FINAL_PAYMENT_EVENT_TYPES.has(eventType) ||
    (eventType.includes('payment') && eventType.includes('captured'))
  );
}

export function isRefundEventType(eventType: string): boolean {
  return REFUND_EVENT_TYPES.has(eventType) || eventType.includes('refund');
}

export function parsePaymentPayloadRefs(payload: Record<string, unknown> | null | undefined): {
  patientPackageId: string | null;
} {
  const p = payload ?? {};
  let patientPackageId = typeof p.patientPackageId === 'string' ? p.patientPackageId : null;
  const productRef = typeof p.productRef === 'string' ? p.productRef : null;
  if (productRef?.startsWith('patient_package:')) {
    patientPackageId = productRef.slice('patient_package:'.length);
  }
  return { patientPackageId };
}

export function resolvePaymentTitles(input: {
  purpose: string | null;
  payload: Record<string, unknown> | null | undefined;
  packageTitles: Map<string, string>;
}): { packageTitle: string | null } {
  const refs = parsePaymentPayloadRefs(input.payload);
  let packageTitle = refs.patientPackageId
    ? (input.packageTitles.get(refs.patientPackageId) ?? null)
    : null;
  if (!packageTitle && input.purpose === 'package_purchase') {
    packageTitle = refs.patientPackageId
      ? (input.packageTitles.get(refs.patientPackageId) ?? null)
      : null;
  }
  return { packageTitle };
}

export function dedupeTimelineItems(items: ClientTimelineItem[]): ClientTimelineItem[] {
  const detailedRescheduleAppts = new Set<string>();
  const detailedCancelAppts = new Set<string>();
  const canonicalPaymentHistoryIds = new Set<string>();

  for (const item of items) {
    if (item.category === 'reschedule' && item.appointmentId) {
      detailedRescheduleAppts.add(item.appointmentId);
    }
    if (item.category === 'cancellation' && item.appointmentId) {
      detailedCancelAppts.add(item.appointmentId);
    }
    if (
      item.category === 'payment' &&
      item.linkedObjectType === 'payment_history_event' &&
      item.id === item.linkedObjectId
    ) {
      canonicalPaymentHistoryIds.add(item.linkedObjectId);
    }
  }

  const seen = new Set<string>();
  const out: ClientTimelineItem[] = [];

  for (const item of items) {
    if (
      item.eventType === 'appointment_rescheduled' &&
      item.appointmentId &&
      detailedRescheduleAppts.has(item.appointmentId)
    ) {
      continue;
    }
    if (
      item.eventType === 'appointment_cancelled' &&
      item.appointmentId &&
      detailedCancelAppts.has(item.appointmentId)
    ) {
      continue;
    }
    if (
      item.category === 'payment' &&
      item.linkedObjectType === 'payment_history_event' &&
      canonicalPaymentHistoryIds.has(item.linkedObjectId) &&
      item.id !== item.linkedObjectId
    ) {
      continue;
    }
    if (item.category === 'package' && item.linkedObjectType === 'package_usage') {
      const usageId = item.payload.usageId;
      if (typeof usageId === 'string') {
        const hasHistory = items.some(
          (other) =>
            other.category === 'package' &&
            other.id !== item.id &&
            other.payload.usageId === usageId,
        );
        if (hasHistory) continue;
      }
    }

    const key = `${item.category}:${item.linkedObjectType}:${item.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }

  return out.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
}

/** Статусы записи, которые исключают её из «активных» независимо от даты начала. */
export const CANCELLED_APPOINTMENT_STATUSES = new Set([
  'cancelled_by_patient',
  'cancelled_by_specialist',
  'late_cancellation',
  'no_show',
]);

export function isCancelledAppointmentStatus(status: string): boolean {
  return CANCELLED_APPOINTMENT_STATUSES.has(status);
}

/**
 * Делит визиты на «активные» (предстоящие, не отменённые) и «историю» (прошедшие + отменённые).
 * Используется компактной панелью «Обзор и записи» в чате врача (#814) поверх того же
 * `/api/doctor/clients/:userId/history`, не заводя отдельный эндпоинт.
 * Активные — по возрастанию startAt (ближайшая запись первой); история — как пришло (desc по startAt, из БД).
 */
export function splitVisitsByActivity(
  visits: ClientVisitHistoryRow[],
  nowMs: number = Date.now(),
): { active: ClientVisitHistoryRow[]; history: ClientVisitHistoryRow[] } {
  const active: ClientVisitHistoryRow[] = [];
  const history: ClientVisitHistoryRow[] = [];
  for (const visit of visits) {
    const startMs = new Date(visit.startAt).getTime();
    const isUpcoming = Number.isFinite(startMs) && startMs >= nowMs;
    if (isUpcoming && !isCancelledAppointmentStatus(visit.status)) {
      active.push(visit);
    } else {
      history.push(visit);
    }
  }
  active.sort((a, b) => a.startAt.localeCompare(b.startAt));
  return { active, history };
}

export function enrichPaymentHistoryRow(
  row: {
    id: string;
    occurredAt: string;
    eventType: string;
    amountMinor: number | null;
    currency: string | null;
    providerId: string | null;
    status: string | null;
    purpose: string | null;
    appointmentId: string | null;
    paymentId: string | null;
    refundId: string | null;
    comment: string | null;
    payloadJson: Record<string, unknown> | null;
  },
  ctx: {
    serviceByAppt: Map<string, string>;
    packageTitles: Map<string, string>;
    paymentMethodLabel: (providerId: string | null) => string | null;
  },
): ClientPaymentHistoryRow {
  const { packageTitle } = resolvePaymentTitles({
    purpose: row.purpose,
    payload: row.payloadJson,
    packageTitles: ctx.packageTitles,
  });
  return {
    id: row.id,
    occurredAt: row.occurredAt,
    eventType: row.eventType,
    amountMinor: row.amountMinor,
    currency: row.currency,
    providerId: row.providerId,
    paymentMethodLabel: ctx.paymentMethodLabel(row.providerId),
    status: row.status,
    purpose: row.purpose,
    appointmentId: row.appointmentId,
    paymentId: row.paymentId,
    refundId: row.refundId,
    comment: row.comment,
    serviceTitle: row.appointmentId ? (ctx.serviceByAppt.get(row.appointmentId) ?? null) : null,
    packageTitle,
  };
}
