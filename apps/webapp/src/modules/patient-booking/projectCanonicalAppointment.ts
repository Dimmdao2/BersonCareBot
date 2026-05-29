import type { AppointmentProjectionPort } from "./ports";
import type { BeAppointment } from "@/modules/booking-engine/types";

export function nativeIntegratorRecordId(appointmentId: string): string {
  return `be:${appointmentId}`;
}

type ProjectionContactFields = {
  phoneNormalized: string | null;
  contactName: string;
  serviceTitle: string | null;
  branchTitle: string | null;
};

function basePayloadJson(
  appt: BeAppointment,
  input: ProjectionContactFields,
): Record<string, unknown> {
  return {
    source: "native",
    appointment_id: appt.id,
    contact_name: input.contactName,
    service_title: input.serviceTitle,
    branch_title: input.branchTitle,
    datetime_start: appt.startAt,
    datetime_end: appt.endAt,
  };
}

export async function projectCanonicalAppointmentForDoctor(
  projection: AppointmentProjectionPort,
  appt: BeAppointment,
  input: ProjectionContactFields,
): Promise<void> {
  await projection.upsertRecordFromProjection({
    integratorRecordId: nativeIntegratorRecordId(appt.id),
    phoneNormalized: input.phoneNormalized,
    recordAt: appt.startAt,
    status: "created",
    lastEvent: "native.created",
    updatedAt: new Date().toISOString(),
    branchId: appt.branchId,
    payloadJson: basePayloadJson(appt, input),
  });
}

export async function projectCanonicalAppointmentRescheduled(
  projection: AppointmentProjectionPort,
  appt: BeAppointment,
  input: ProjectionContactFields,
): Promise<void> {
  await projection.upsertRecordFromProjection({
    integratorRecordId: nativeIntegratorRecordId(appt.id),
    phoneNormalized: input.phoneNormalized ?? appt.phoneNormalized,
    recordAt: appt.startAt,
    status: "updated",
    lastEvent: "native.rescheduled",
    updatedAt: new Date().toISOString(),
    branchId: appt.branchId,
    payloadJson: basePayloadJson(appt, input),
  });
}

export async function projectCanonicalAppointmentCancelled(
  projection: AppointmentProjectionPort,
  appt: BeAppointment,
  input: ProjectionContactFields,
): Promise<void> {
  await projection.upsertRecordFromProjection({
    integratorRecordId: nativeIntegratorRecordId(appt.id),
    phoneNormalized: input.phoneNormalized ?? appt.phoneNormalized,
    recordAt: appt.startAt,
    status: "cancelled",
    lastEvent: "native.cancelled",
    updatedAt: new Date().toISOString(),
    branchId: appt.branchId,
    payloadJson: basePayloadJson(appt, input),
  });
}
