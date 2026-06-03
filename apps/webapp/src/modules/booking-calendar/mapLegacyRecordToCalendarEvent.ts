import type { CalendarAppointmentEvent } from "./types";

export type LegacyAppointmentRecordRow = {
  integrator_record_id: string;
  phone_normalized: string | null;
  record_at: Date | null;
  status: string;
  payload_json: {
    link?: string;
    url?: string;
    record_url?: string;
    service_title?: string;
    name?: string;
    duration_minutes?: number;
    durationMinutes?: number;
  } | null;
  user_id: string | null;
  display_name: string | null;
  branch_name: string | null;
  branch_id: string | null;
  mapped_be_branch_id: string | null;
  package_usage_ref?: string | null;
  package_title?: string | null;
};

const DEFAULT_DURATION_MINUTES = 60;

export function legacyRecordDurationMinutes(payload: LegacyAppointmentRecordRow["payload_json"]): number {
  const p = payload ?? {};
  const fromPayload =
    typeof p.duration_minutes === "number" && p.duration_minutes > 0
      ? p.duration_minutes
      : typeof p.durationMinutes === "number" && p.durationMinutes > 0
        ? p.durationMinutes
        : null;
  return fromPayload ?? DEFAULT_DURATION_MINUTES;
}

export function mapLegacyRecordToCalendarEvent(row: LegacyAppointmentRecordRow): CalendarAppointmentEvent | null {
  if (!row.record_at || row.status === "canceled") return null;

  const startAt = row.record_at.toISOString();
  const durationMinutes = legacyRecordDurationMinutes(row.payload_json);
  const endAt = new Date(row.record_at.getTime() + durationMinutes * 60_000).toISOString();

  const payload = row.payload_json ?? {};
  const nameFromPayload =
    typeof payload.name === "string" && payload.name.trim().length > 0 ? payload.name.trim() : null;
  const patientName =
    (row.display_name && row.display_name.trim()) ||
    nameFromPayload ||
    row.phone_normalized?.trim() ||
    null;
  const serviceTitle =
    typeof payload.service_title === "string" && payload.service_title.trim()
      ? payload.service_title.trim()
      : null;

  return {
    kind: "appointment",
    id: row.integrator_record_id,
    startAt,
    endAt,
    status: "confirmed",
    source: "rubitime_legacy",
    specialistId: null,
    specialistName: null,
    branchId: row.mapped_be_branch_id?.trim() || null,
    branchTitle: row.branch_name?.trim() || null,
    roomId: null,
    roomTitle: null,
    serviceId: null,
    serviceTitle,
    platformUserId: row.user_id,
    patientName,
    patientPhone: row.phone_normalized?.trim() || null,
    bookingStatus: row.status,
    paymentStatus: null,
    prepaymentPending: false,
    packageUsageRef: row.package_usage_ref?.trim() || null,
    packageTitle: row.package_title?.trim() || null,
    rescheduleCount: 0,
    originalStartAt: null,
    formComments: [],
  };
}
