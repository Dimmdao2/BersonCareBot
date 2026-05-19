import { APPOINTMENT_RECORD_UPSERTED } from '../../kernel/contracts/index.js';
import type { ProjectionFanoutInput } from './repos/projectionFanout.js';
import { hashPayload, projectionIdempotencyKey } from './repos/projectionKeys.js';

export type BookingUpsertFanoutSource = {
  externalRecordId: string;
  phoneNormalized: string | null;
  recordAt: string | null;
  status: 'created' | 'updated' | 'canceled';
  payloadJson: Record<string, unknown>;
  lastEvent: string;
  updatedAt: string;
  patientFirstName: string | null;
  patientLastName: string | null;
  patientEmail: string | null;
  integratorBranchId: string | null;
  branchName: string | null;
  dateTimeEnd: string | null;
  serviceId: string | null;
  serviceName: string | null;
  rubitimeCooperatorId: string | null;
  integratorUserId: string | null;
};

function emailFromPayload(payloadJson: Record<string, unknown>): string | null {
  const raw =
    (typeof payloadJson.email === 'string' ? payloadJson.email : null) ??
    (typeof payloadJson.clientEmail === 'string' ? payloadJson.clientEmail : null);
  return raw?.trim() ? raw.trim() : null;
}

/** Builds webapp `appointment.record.upserted` fan-out after integrator `booking.upsert`. */
export function buildAppointmentRecordUpsertedFanout(
  source: BookingUpsertFanoutSource,
): ProjectionFanoutInput {
  const patientEmail = source.patientEmail?.trim() || emailFromPayload(source.payloadJson);
  const rubitimeManageUrl =
    (typeof source.payloadJson.url === 'string' ? source.payloadJson.url : null) ??
    (typeof source.payloadJson.link === 'string' ? source.payloadJson.link : null) ??
    (typeof source.payloadJson.record_url === 'string' ? source.payloadJson.record_url : null);

  const projectionPayload: Record<string, unknown> = {
    integratorRecordId: source.externalRecordId,
    phoneNormalized: source.phoneNormalized,
    recordAt: source.recordAt,
    status: source.status,
    payloadJson: source.payloadJson,
    lastEvent: source.lastEvent,
    updatedAt: source.updatedAt,
    patientFirstName: source.patientFirstName,
    patientLastName: source.patientLastName,
    patientEmail,
    integratorBranchId: source.integratorBranchId,
    branchName: source.branchName,
    dateTimeEnd: source.dateTimeEnd,
    serviceId: source.serviceId,
    serviceName: source.serviceName,
    rubitimeCooperatorId: source.rubitimeCooperatorId,
    integratorUserId: source.integratorUserId,
    rubitimeManageUrl,
  };

  return {
    eventType: APPOINTMENT_RECORD_UPSERTED,
    idempotencyKey: projectionIdempotencyKey(
      APPOINTMENT_RECORD_UPSERTED,
      source.externalRecordId,
      hashPayload(projectionPayload),
    ),
    occurredAt: source.updatedAt,
    payload: projectionPayload,
  };
}
