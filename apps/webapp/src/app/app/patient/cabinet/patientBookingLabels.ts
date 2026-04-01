import type { PatientBookingRecord } from "@/modules/patient-booking/types";

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
