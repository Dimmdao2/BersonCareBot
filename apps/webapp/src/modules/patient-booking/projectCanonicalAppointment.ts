import type { AppointmentProjectionPort } from './ports';
import type { BeAppointment } from '@/modules/booking-engine/types';

export function nativeIntegratorRecordId(appointmentId: string): string {
  return `be:${appointmentId}`;
}

type ProjectionContactFields = {
  phoneNormalized: string | null;
  contactName: string;
  serviceTitle: string | null;
  branchTitle: string | null;
  /** Legacy `branches.id` — never `be_branches.id`. */
  legacyBranchId?: string | null;
};

function basePayloadJson(
  appt: BeAppointment,
  input: ProjectionContactFields,
): Record<string, unknown> {
  return {
    source: 'native',
    appointment_id: appt.id,
    platform_user_id: appt.platformUserId,
    specialist_id: appt.specialistId,
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
    organizationId: appt.organizationId,
    platformUserId: appt.platformUserId,
    integratorRecordId: nativeIntegratorRecordId(appt.id),
    phoneNormalized: input.phoneNormalized,
    recordAt: appt.startAt,
    status: 'created',
    lastEvent: 'native.created',
    updatedAt: new Date().toISOString(),
    branchId: input.legacyBranchId ?? null,
    payloadJson: basePayloadJson(appt, input),
  });
}

export async function projectCanonicalAppointmentRescheduled(
  projection: AppointmentProjectionPort,
  appt: BeAppointment,
  input: ProjectionContactFields,
): Promise<void> {
  await projection.upsertRecordFromProjection({
    organizationId: appt.organizationId,
    platformUserId: appt.platformUserId,
    integratorRecordId: nativeIntegratorRecordId(appt.id),
    phoneNormalized: input.phoneNormalized ?? appt.phoneNormalized,
    recordAt: appt.startAt,
    status: 'updated',
    lastEvent: 'native.rescheduled',
    updatedAt: new Date().toISOString(),
    branchId: input.legacyBranchId ?? null,
    payloadJson: basePayloadJson(appt, input),
  });
}

export async function projectCanonicalAppointmentCancelled(
  projection: AppointmentProjectionPort,
  appt: BeAppointment,
  input: ProjectionContactFields,
): Promise<void> {
  await projection.upsertRecordFromProjection({
    organizationId: appt.organizationId,
    platformUserId: appt.platformUserId,
    integratorRecordId: nativeIntegratorRecordId(appt.id),
    phoneNormalized: input.phoneNormalized ?? appt.phoneNormalized,
    recordAt: appt.startAt,
    status: 'canceled',
    lastEvent: 'native.cancelled',
    updatedAt: new Date().toISOString(),
    branchId: input.legacyBranchId ?? null,
    payloadJson: basePayloadJson(appt, input),
  });
}

export async function projectCanonicalAppointmentNoShow(
  projection: AppointmentProjectionPort,
  appt: BeAppointment,
  input: ProjectionContactFields,
): Promise<void> {
  // No-show is treated as a cancelled status in the projection layer.
  // lastEvent distinguishes it for downstream consumers (e.g. analytics).
  await projection.upsertRecordFromProjection({
    organizationId: appt.organizationId,
    platformUserId: appt.platformUserId,
    integratorRecordId: nativeIntegratorRecordId(appt.id),
    phoneNormalized: input.phoneNormalized ?? appt.phoneNormalized,
    recordAt: appt.startAt,
    status: 'canceled',
    lastEvent: 'native.no_show',
    updatedAt: new Date().toISOString(),
    branchId: input.legacyBranchId ?? null,
    payloadJson: basePayloadJson(appt, input),
  });
}
