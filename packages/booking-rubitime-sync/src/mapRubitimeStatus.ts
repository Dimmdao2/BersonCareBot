import {
  isRubitimeNormalizedStatus,
  normalizeRubitimeStatus,
  resolveRubitimeStatusFromPayload,
  type RubitimeNormalizedStatus,
} from "./rubitimeNormalizedStatus.js";

export type RubitimeMappedPatientBookingStatus =
  | "creating"
  | "awaiting_payment"
  | "confirmed"
  | "cancelled"
  | "rescheduled"
  | "completed"
  | "no_show"
  | "failed_sync"
  | "cancelling"
  | "cancel_failed";

function mapNormalizedToPatientBooking(
  normalized: RubitimeNormalizedStatus,
): RubitimeMappedPatientBookingStatus {
  switch (normalized) {
    case "recorded":
      return "confirmed";
    case "in_service":
      return "confirmed";
    case "completed":
      return "completed";
    case "awaiting_prepayment":
      return "awaiting_payment";
    case "canceled":
      return "cancelled";
    case "awaiting_confirmation":
      return "confirmed";
    case "in_cart":
      return "creating";
    case "moved_awaiting":
      return "rescheduled";
  }
}

export function mapRubitimeStatusToPatientBookingStatus(
  rawStatus: string,
  options?: { legacyEventStatus?: string; payloadJson?: unknown },
): RubitimeMappedPatientBookingStatus {
  const fromPayload = resolveRubitimeStatusFromPayload(
    options?.payloadJson,
    options?.legacyEventStatus ?? rawStatus,
  );
  if (fromPayload) return mapNormalizedToPatientBooking(fromPayload);

  const direct = rawStatus.trim();
  if (isRubitimeNormalizedStatus(direct)) return mapNormalizedToPatientBooking(direct);

  const normalized = normalizeRubitimeStatus(direct);
  if (normalized) return mapNormalizedToPatientBooking(normalized);

  const x = rawStatus.toLowerCase();
  if (x.includes("cancel") || x.includes("отмен")) return "cancelled";
  if (x.includes("resched") || x.includes("перенос")) return "rescheduled";
  if (x.includes("complete") || x.includes("заверш")) return "completed";
  if (x.includes("no_show")) return "no_show";
  if (x.includes("prepay") || x.includes("предоплат")) return "awaiting_payment";
  if (x.includes("подтвержд")) return "confirmed";
  if (x === "created" || x === "updated") return "confirmed";
  return "confirmed";
}
