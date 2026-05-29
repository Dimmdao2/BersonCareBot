import type { AppointmentProjectionPort } from "./ports";
import type { BeAppointment } from "@/modules/booking-engine/types";

export function nativeIntegratorRecordId(appointmentId: string): string {
  return `be:${appointmentId}`;
}

export async function projectCanonicalAppointmentForDoctor(
  projection: AppointmentProjectionPort,
  appt: BeAppointment,
  input: {
    phoneNormalized: string | null;
    contactName: string;
    serviceTitle: string | null;
    branchTitle: string | null;
  },
): Promise<void> {
  await projection.upsertRecordFromProjection({
    integratorRecordId: nativeIntegratorRecordId(appt.id),
    phoneNormalized: input.phoneNormalized,
    recordAt: appt.startAt,
    status: "created",
    lastEvent: "native.created",
    updatedAt: new Date().toISOString(),
    branchId: appt.branchId,
    payloadJson: {
      source: "native",
      appointment_id: appt.id,
      contact_name: input.contactName,
      service_title: input.serviceTitle,
      branch_title: input.branchTitle,
      datetime_start: appt.startAt,
      datetime_end: appt.endAt,
    },
  });
}
