import type { PatientBookingRecord } from "@/modules/patient-booking/types";
import { SCHEDULE_RECORD_PROVENANCE_PREFIX } from "@/shared/lib/scheduleRecordProvenance";

export { SCHEDULE_RECORD_PROVENANCE_PREFIX };

/**
 * Prefix for cards sourced from Rubitime projection (compat-sync), not from native webapp booking.
 * DB columns `provenance_created_by` / `provenance_updated_by` hold the actor hint; extend mapping when new values appear.
 */
export function bookingProvenancePrefix(row: PatientBookingRecord): string {
  if (row.bookingSource !== "rubitime_projection") return "";
  return SCHEDULE_RECORD_PROVENANCE_PREFIX;
}

/** Subtitle under datetime for native booking cards (active + history). */
export function nativeBookingSubtitle(row: PatientBookingRecord): string {
  if (row.bookingType === "online") {
    if (row.category === "rehab_lfk") return "Онлайн - Реабилитация (ЛФК)";
    if (row.category === "nutrition") return "Онлайн - Нутрициология";
    return "Онлайн консультация";
  }
  const canonical = row.canonicalInPersonContext;
  if (canonical) {
    const city =
      canonical.cityCode === "moscow"
        ? "Москва"
        : canonical.cityCode === "spb"
          ? "СПб"
          : canonical.cityCode;
    const place = city ? `${city} · ` : "";
    return `Очный приём — ${place}${canonical.serviceTitle}`;
  }
  // A legacy row can remain visible for trace/history, but must not surface a
  // legacy catalog label as though it were a canonical service.
  return "Очный приём";
}
