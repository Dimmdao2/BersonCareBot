import {
  isRubitimeNormalizedStatus,
  normalizeRubitimeStatus,
  resolveRubitimeStatusFromPayload,
  type RubitimeNormalizedStatus,
} from "./rubitimeNormalizedStatus.js";

/** Subset of `be_appointments.status` used for Rubitime projection/sync. */
export type RubitimeMappedBeAppointmentStatus =
  | "created"
  | "awaiting_payment"
  | "confirmed"
  | "rescheduled"
  | "cancelled_by_patient"
  | "manual_review_required"
  | "completed";

export function mapRubitimeNormalizedStatusToBeAppointment(
  normalized: RubitimeNormalizedStatus,
): RubitimeMappedBeAppointmentStatus {
  switch (normalized) {
    case "recorded":
      return "confirmed";
    case "in_service":
      // «Услуга оказана» — отдельное продуктовое решение позже; пока активная запись.
      return "confirmed";
    case "completed":
      return "completed";
    case "awaiting_prepayment":
      return "awaiting_payment";
    case "canceled":
      return "cancelled_by_patient";
    case "awaiting_confirmation":
      return "manual_review_required";
    case "in_cart":
      return "created";
    case "moved_awaiting":
      return "rescheduled";
  }
}

export function mapRubitimeStatusToBeAppointment(
  rawStatus: string,
  lastEvent: string,
  payloadJson?: unknown,
): RubitimeMappedBeAppointmentStatus {
  const fromPayload = resolveRubitimeStatusFromPayload(payloadJson, rawStatus);
  if (fromPayload) return mapRubitimeNormalizedStatusToBeAppointment(fromPayload);

  const direct = rawStatus.trim();
  if (isRubitimeNormalizedStatus(direct)) {
    return mapRubitimeNormalizedStatusToBeAppointment(direct);
  }

  const normalized = normalizeRubitimeStatus(direct);
  if (normalized) return mapRubitimeNormalizedStatusToBeAppointment(normalized);

  const legacy = rawStatus.toLowerCase();
  const ev = lastEvent.toLowerCase();
  if (legacy === "canceled" || ev.includes("cancel")) return "cancelled_by_patient";
  if (legacy === "updated" && (ev.includes("resched") || ev.includes("move"))) return "rescheduled";
  if (legacy === "updated" || legacy === "created") return "confirmed";
  return "confirmed";
}
