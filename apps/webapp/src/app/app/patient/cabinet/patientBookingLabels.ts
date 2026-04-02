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
  if (row.branchServiceId && row.serviceTitleSnapshot) {
    const city =
      row.cityCodeSnapshot === "moscow"
        ? "Москва"
        : row.cityCodeSnapshot === "spb"
          ? "СПб"
          : row.cityCodeSnapshot ?? row.city ?? "";
    const place = city ? `${city} · ` : "";
    return `Очный приём — ${place}${row.serviceTitleSnapshot}`;
  }
  const city =
    row.city === "moscow" ? "Москва" : row.city === "spb" ? "СПб" : row.city ? row.city : "";
  return city ? `Очный приём — ${city}` : "Очный приём";
}
