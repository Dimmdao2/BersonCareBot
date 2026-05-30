import { getPool } from "@/infra/db/client";
import { AR_CANCELLATION_LAST_EVENT_EXCLUSION_SQL } from "@/infra/repos/pgDoctorAppointments";
import type { BookingCalendarPort } from "@/modules/booking-calendar/ports";
import {
  legacyRecordDurationMinutes,
  mapLegacyRecordToCalendarEvent,
  type LegacyAppointmentRecordRow,
} from "@/modules/booking-calendar/mapLegacyRecordToCalendarEvent";
import type { CalendarAppointmentEvent, CalendarFilters } from "@/modules/booking-calendar/types";
import { createPgBookingCalendarPort } from "@/infra/repos/pgBookingCalendar";

const LIST_SELECT = `SELECT
  ar.integrator_record_id,
  ar.phone_normalized,
  ar.record_at,
  ar.status,
  ar.payload_json,
  ar.branch_id,
  pu.id AS user_id,
  COALESCE(pu.display_name, pu.first_name || ' ' || NULLIF(pu.last_name, ''), pu.first_name, pu.last_name) AS display_name,
  b.name AS branch_name,
  branch_map.canonical_id AS mapped_be_branch_id`;

function mapRows(rows: LegacyAppointmentRecordRow[]): CalendarAppointmentEvent[] {
  const events: CalendarAppointmentEvent[] = [];
  for (const row of rows) {
    const event = mapLegacyRecordToCalendarEvent(row);
    if (event) events.push(event);
  }
  return events;
}

/** Calendar read from Rubitime `appointment_records` (range overlap, not upcoming-only list). */
export function createPgBookingCalendarLegacyPort(): Pick<BookingCalendarPort, "listAppointmentsInRange"> {
  return {
    async listAppointmentsInRange(filters: CalendarFilters): Promise<CalendarAppointmentEvent[]> {
      const pool = getPool();
      const result = await pool.query<LegacyAppointmentRecordRow>(
        `${LIST_SELECT}
         FROM appointment_records ar
         LEFT JOIN platform_users pu ON ar.phone_normalized = pu.phone_normalized AND pu.merged_into_id IS NULL
         LEFT JOIN branches b ON ar.branch_id = b.id
         LEFT JOIN be_external_entity_mappings branch_map ON branch_map.entity_type = 'branch'
           AND branch_map.external_system = 'rubitime'
           AND branch_map.external_id = b.integrator_branch_id::text
         WHERE ar.deleted_at IS NULL
           AND ar.status IN ('created', 'updated')
           AND ${AR_CANCELLATION_LAST_EVENT_EXCLUSION_SQL}
           AND ar.record_at IS NOT NULL
           AND ar.record_at < $2::timestamptz
           AND ar.record_at + (
             COALESCE(
               NULLIF((ar.payload_json->>'duration_minutes')::int, 0),
               NULLIF((ar.payload_json->>'durationMinutes')::int, 0),
               $3::int
             ) * interval '1 minute'
           ) > $1::timestamptz
         ORDER BY ar.record_at ASC`,
        [filters.rangeStart, filters.rangeEnd, legacyRecordDurationMinutes(null)],
      );
      return mapRows(result.rows);
    },
  };
}

/** Legacy port delegates filter meta and slot resolution to canonical catalog. */
export function createPgBookingCalendarLegacyCalendarPort(): BookingCalendarPort {
  const canonical = createPgBookingCalendarPort();
  const legacy = createPgBookingCalendarLegacyPort();
  return {
    listAppointmentsInRange: (filters) => legacy.listAppointmentsInRange(filters),
    listFilterMeta: (organizationId) => canonical.listFilterMeta(organizationId),
    resolveSchedulingForSlots: (input) => canonical.resolveSchedulingForSlots(input),
  };
}
