import type { ClientPaymentHistoryRow, ClientTimelineItem } from "./types";

export const PREPAYMENT_EVENT_TYPES = new Set([
  "prepayment_captured",
  "prepayment_retained",
  "prepayment_refunded",
  "prepayment_carried_on_reschedule",
  "package_intent_created",
]);

export const FINAL_PAYMENT_EVENT_TYPES = new Set([
  "payment_captured",
  "payment_succeeded",
  "payment.succeeded",
]);

export const REFUND_EVENT_TYPES = new Set(["refund_succeeded", "payment_refunded", "prepayment_refunded"]);

export function isPrepaymentEventType(eventType: string): boolean {
  return PREPAYMENT_EVENT_TYPES.has(eventType) || eventType.includes("prepayment");
}

export function isFinalPaymentEventType(eventType: string): boolean {
  if (eventType.includes("prepayment")) return false;
  if (eventType.includes("refund")) return false;
  return FINAL_PAYMENT_EVENT_TYPES.has(eventType) || (eventType.includes("payment") && eventType.includes("captured"));
}

export function isRefundEventType(eventType: string): boolean {
  return REFUND_EVENT_TYPES.has(eventType) || eventType.includes("refund");
}

export function parsePaymentPayloadRefs(payload: Record<string, unknown> | null | undefined): {
  patientPackageId: string | null;
  productPurchaseId: string | null;
} {
  const p = payload ?? {};
  const fromPayload =
    typeof p.patientPackageId === "string"
      ? p.patientPackageId
      : typeof p.productPurchaseId === "string"
        ? null
        : null;
  const productFromPayload = typeof p.productPurchaseId === "string" ? p.productPurchaseId : null;
  const productRef = typeof p.productRef === "string" ? p.productRef : null;
  let patientPackageId = fromPayload;
  let productPurchaseId = productFromPayload;
  if (productRef?.startsWith("patient_package:")) {
    patientPackageId = productRef.slice("patient_package:".length);
  }
  if (productRef?.startsWith("product_purchase:")) {
    productPurchaseId = productRef.slice("product_purchase:".length);
  }
  return { patientPackageId, productPurchaseId };
}

export function resolvePaymentTitles(input: {
  purpose: string | null;
  payload: Record<string, unknown> | null | undefined;
  packageTitles: Map<string, string>;
  productTitles: Map<string, string>;
}): { packageTitle: string | null; productTitle: string | null } {
  const refs = parsePaymentPayloadRefs(input.payload);
  let packageTitle = refs.patientPackageId ? (input.packageTitles.get(refs.patientPackageId) ?? null) : null;
  let productTitle = refs.productPurchaseId ? (input.productTitles.get(refs.productPurchaseId) ?? null) : null;
  if (!packageTitle && input.purpose === "package_purchase") {
    packageTitle = refs.patientPackageId ? (input.packageTitles.get(refs.patientPackageId) ?? null) : null;
  }
  if (!productTitle && input.purpose === "product_purchase") {
    productTitle = refs.productPurchaseId ? (input.productTitles.get(refs.productPurchaseId) ?? null) : null;
  }
  return { packageTitle, productTitle };
}

export function dedupeTimelineItems(items: ClientTimelineItem[]): ClientTimelineItem[] {
  const detailedRescheduleAppts = new Set<string>();
  const detailedCancelAppts = new Set<string>();
  const productPurchaseIdsWithHistory = new Set<string>();
  const canonicalPaymentHistoryIds = new Set<string>();

  for (const item of items) {
    if (item.category === "reschedule" && item.appointmentId) {
      detailedRescheduleAppts.add(item.appointmentId);
    }
    if (item.category === "cancellation" && item.appointmentId) {
      detailedCancelAppts.add(item.appointmentId);
    }
    if (item.category === "product" && item.linkedObjectType === "product_history_event") {
      const purchaseId = item.payload.productPurchaseId;
      if (typeof purchaseId === "string") productPurchaseIdsWithHistory.add(purchaseId);
    }
    if (
      item.category === "payment" &&
      item.linkedObjectType === "payment_history_event" &&
      item.id === item.linkedObjectId
    ) {
      canonicalPaymentHistoryIds.add(item.linkedObjectId);
    }
  }

  const seen = new Set<string>();
  const out: ClientTimelineItem[] = [];

  for (const item of items) {
    if (
      item.eventType === "appointment_rescheduled" &&
      item.appointmentId &&
      detailedRescheduleAppts.has(item.appointmentId)
    ) {
      continue;
    }
    if (
      item.eventType === "appointment_cancelled" &&
      item.appointmentId &&
      detailedCancelAppts.has(item.appointmentId)
    ) {
      continue;
    }
    if (item.eventType === "product_purchased") {
      const purchaseId =
        typeof item.payload.productPurchaseId === "string"
          ? item.payload.productPurchaseId
          : item.linkedObjectType === "product_purchase"
            ? item.linkedObjectId
            : null;
      if (purchaseId && productPurchaseIdsWithHistory.has(purchaseId)) continue;
    }
    if (
      item.category === "payment" &&
      item.linkedObjectType === "payment_history_event" &&
      canonicalPaymentHistoryIds.has(item.linkedObjectId) &&
      item.id !== item.linkedObjectId
    ) {
      continue;
    }
    if (item.category === "package" && item.linkedObjectType === "package_usage") {
      const usageId = item.payload.usageId;
      if (typeof usageId === "string") {
        const hasHistory = items.some(
          (other) =>
            other.category === "package" &&
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
    productTitles: Map<string, string>;
    paymentMethodLabel: (providerId: string | null) => string | null;
  },
): ClientPaymentHistoryRow {
  const { packageTitle, productTitle } = resolvePaymentTitles({
    purpose: row.purpose,
    payload: row.payloadJson,
    packageTitles: ctx.packageTitles,
    productTitles: ctx.productTitles,
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
    productTitle,
  };
}
