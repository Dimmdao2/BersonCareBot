import type { PatientBookingRecord } from "@/modules/patient-booking/types";
import { SCHEDULE_RECORD_PROVENANCE_PREFIX } from "@/shared/lib/scheduleRecordProvenance";

export { SCHEDULE_RECORD_PROVENANCE_PREFIX };

/** Retained call-site helper; canonical booking cards have no external provenance prefix. */
export function bookingProvenancePrefix(_row: PatientBookingRecord): string {
  return "";
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
  return "Очный приём";
}
