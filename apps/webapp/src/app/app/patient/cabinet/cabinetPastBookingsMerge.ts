import type { PastAppointmentSummary } from "@/modules/appointments/service";
import type { PatientBookingRecord } from "@/modules/patient-booking/types";

export type CabinetPastRow =
  | { kind: "native"; booking: PatientBookingRecord }
  | { kind: "projection"; past: PastAppointmentSummary };

/**
 * Объединяет историю из `patient_bookings` и проекцию Rubitime (`appointment_records`),
 * исключая дубли по `rubitime_id` / id записи интегратора.
 */
export function mergePastBookingHistory(
  nativeHistory: PatientBookingRecord[],
  projection: PastAppointmentSummary[],
): CabinetPastRow[] {
  const rubitimeIds = new Set(nativeHistory.map((r) => r.rubitimeId).filter(Boolean));
  const filteredProjection = projection.filter((p) => !rubitimeIds.has(p.id));
  const rows: CabinetPastRow[] = [
    ...nativeHistory.map((booking) => ({ kind: "native" as const, booking })),
    ...filteredProjection.map((past) => ({ kind: "projection" as const, past })),
  ];
  rows.sort((a, b) => {
    const ta =
      a.kind === "native"
        ? new Date(a.booking.slotStart).getTime()
        : a.past.recordAtIso
          ? new Date(a.past.recordAtIso).getTime()
          : 0;
    const tb =
      b.kind === "native"
        ? new Date(b.booking.slotStart).getTime()
        : b.past.recordAtIso
          ? new Date(b.past.recordAtIso).getTime()
          : 0;
    return tb - ta;
  });
  return rows;
}
