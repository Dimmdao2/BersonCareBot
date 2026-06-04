import { resolveAppointmentStatsBounds } from "@/modules/doctor-appointments/resolveAppointmentStatsBounds";
import { getAppDisplayTimeZone } from "@/modules/system-settings/appDisplayTimezone";
import { localDayRangeBoundsIso } from "@/shared/datetime/localDayRangeBounds";
import { getPool } from "@/infra/db/client";
import { rubitimeNameIfDifferent } from "@/shared/lib/appointmentRubitimeNameMismatch";
import { SCHEDULE_RECORD_PROVENANCE_PREFIX } from "@/shared/lib/scheduleRecordProvenance";
import type {
  AppointmentRow,
  AppointmentStats,
  DoctorAppointmentStatsFilter,
  DoctorAppointmentsListFilter,
  DoctorAppointmentsPort,
  DoctorDashboardAppointmentMetrics,
} from "@/modules/doctor-appointments/ports";

/** Заполнение строки `time` перенесено в createDoctorAppointmentsService (бизнес-таймзона из system_settings). */

export const CANCELLATION_LAST_EVENT_EXCLUSION_SQL = "last_event NOT IN ('event-remove-record', 'event-delete-record')";

/** Для запросов с алиасом `ar`. */
export const AR_CANCELLATION_LAST_EVENT_EXCLUSION_SQL =
  "ar.last_event NOT IN ('event-remove-record', 'event-delete-record')";

/**
 * Будущая активная запись: согласовано с кабинетом пациента (`record_at >= now()`).
 * Только строки с известным временем слота (врачебный список).
 */
export const AR_ACTIVE_UPCOMING_SQL = `ar.deleted_at IS NULL
  AND ar.status IN ('created', 'updated')
  AND ar.record_at IS NOT NULL
  AND ar.record_at >= NOW()`;

const LIST_SELECT = `SELECT
          ar.integrator_record_id,
          ar.phone_normalized,
          ar.record_at,
          ar.status,
          ar.payload_json,
          pu.id AS user_id,
          COALESCE(pu.display_name, pu.first_name || ' ' || NULLIF(pu.last_name, ''), pu.first_name, pu.last_name) AS display_name,
          b.name AS branch_name`;

function mapListRows(
  rows: {
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
    };
    user_id: string | null;
    display_name: string | null;
    branch_name: string | null;
  }[]
): AppointmentRow[] {
  return rows.map((row) => {
    const payload = row.payload_json ?? {};
    const link =
      (payload.link && payload.link.trim()) ||
      (payload.url && payload.url.trim()) ||
      (payload.record_url && payload.record_url.trim()) ||
      null;
    const nameFromPayload =
      typeof payload.name === "string" && payload.name.trim().length > 0 ? payload.name.trim() : null;
    const phoneLabel = row.phone_normalized?.trim() || null;
    const clientLabel =
      (row.display_name && row.display_name.trim()) ||
      nameFromPayload ||
      phoneLabel ||
      "Неизвестный клиент";
    const rubitimeHint = rubitimeNameIfDifferent(row.display_name, nameFromPayload);
    return {
      id: row.integrator_record_id,
      clientUserId: row.user_id ?? "",
      clientLabel,
      rubitimeNameIfDifferent: rubitimeHint,
      time: "",
      recordAtIso: row.record_at ? row.record_at.toISOString() : null,
      dateKey: "",
      type: (payload.service_title && payload.service_title.trim()) || "Запись",
      status: row.status,
      link,
      cancellationCountForClient: 0,
      branchName: row.branch_name ?? null,
      scheduleProvenancePrefix: SCHEDULE_RECORD_PROVENANCE_PREFIX,
    };
  });
}

export function createPgDoctorAppointmentsPort(): DoctorAppointmentsPort {
  return {
    async listAppointmentsForSpecialist(filter: DoctorAppointmentsListFilter): Promise<AppointmentRow[]> {
      const pool = getPool();
      let result: {
        rows: Parameters<typeof mapListRows>[0];
      };

      if (filter.kind === "range") {
        const iana = await getAppDisplayTimeZone();
        const { from, to } = localDayRangeBoundsIso(filter.range, iana);
        result = await pool.query(
          `${LIST_SELECT}
         FROM appointment_records ar
         LEFT JOIN platform_users pu ON ar.phone_normalized = pu.phone_normalized AND pu.merged_into_id IS NULL
         LEFT JOIN branches b ON ar.branch_id = b.id
         WHERE ar.status != 'canceled'
           AND ar.deleted_at IS NULL
           AND ar.record_at IS NOT NULL
           AND ar.record_at >= $1::timestamptz
           AND ar.record_at <= $2::timestamptz
         ORDER BY ar.record_at ASC`,
          [from, to]
        );
      } else if (filter.kind === "futureActive") {
        result = await pool.query(
          `${LIST_SELECT}
         FROM appointment_records ar
         LEFT JOIN platform_users pu ON ar.phone_normalized = pu.phone_normalized AND pu.merged_into_id IS NULL
         LEFT JOIN branches b ON ar.branch_id = b.id
         WHERE ${AR_ACTIVE_UPCOMING_SQL}
         ORDER BY ar.record_at ASC`
        );
      } else if (filter.kind === "recordsInCalendarMonth") {
        result = await pool.query(
          `${LIST_SELECT}
         FROM appointment_records ar
         LEFT JOIN platform_users pu ON ar.phone_normalized = pu.phone_normalized AND pu.merged_into_id IS NULL
         LEFT JOIN branches b ON ar.branch_id = b.id
         WHERE ar.deleted_at IS NULL
           AND ar.record_at IS NOT NULL
           AND ar.record_at >= date_trunc('month', NOW())
           AND ar.record_at < date_trunc('month', NOW()) + interval '1 month'
         ORDER BY ar.record_at ASC`
        );
      } else if (filter.kind === "past") {
        const limit = filter.limit ?? 50;
        const offset = filter.offset ?? 0;
        result = await pool.query(
          `${LIST_SELECT}
         FROM appointment_records ar
         LEFT JOIN platform_users pu ON ar.phone_normalized = pu.phone_normalized AND pu.merged_into_id IS NULL
         LEFT JOIN branches b ON ar.branch_id = b.id
         WHERE ar.deleted_at IS NULL
           AND ar.record_at IS NOT NULL
           AND ar.record_at < NOW()
           AND ${AR_CANCELLATION_LAST_EVENT_EXCLUSION_SQL}
         ORDER BY ar.record_at DESC
         LIMIT $1 OFFSET $2`,
          [limit, offset],
        );
      } else {
        result = await pool.query(
          `${LIST_SELECT}
         FROM appointment_records ar
         LEFT JOIN platform_users pu ON ar.phone_normalized = pu.phone_normalized AND pu.merged_into_id IS NULL
         LEFT JOIN branches b ON ar.branch_id = b.id
         WHERE ar.deleted_at IS NULL
           AND ar.status = 'canceled'
           AND ${AR_CANCELLATION_LAST_EVENT_EXCLUSION_SQL}
           AND ar.updated_at >= date_trunc('month', NOW())
           AND ar.updated_at < date_trunc('month', NOW()) + interval '1 month'
         ORDER BY ar.updated_at DESC`
        );
      }

      return mapListRows(result.rows);
    },

    async getAppointmentStats(filter: DoctorAppointmentStatsFilter): Promise<AppointmentStats> {
      const pool = getPool();
      const iana = await getAppDisplayTimeZone();
      const { from, toExclusive } = resolveAppointmentStatsBounds(filter, iana);
      const [rangeResult, bookingsCreatedResult] = await Promise.all([
        pool.query<{
          total: string;
          past_visits: string;
          cancelled_visits: string;
          cancellation_actions: string;
          reschedule_actions: string;
        }>(
          `SELECT
            COUNT(*)::text AS total,
            COUNT(*) FILTER (
              WHERE record_at < NOW()
                AND status <> 'canceled'
            )::text AS past_visits,
            COUNT(*) FILTER (
              WHERE status = 'canceled' AND ${CANCELLATION_LAST_EVENT_EXCLUSION_SQL}
            )::text AS cancelled_visits,
            COUNT(*) FILTER (
              WHERE status = 'canceled'
                AND ${CANCELLATION_LAST_EVENT_EXCLUSION_SQL}
                AND updated_at >= $1::timestamptz AND updated_at < $2::timestamptz
            )::text AS cancellation_actions,
            COUNT(*) FILTER (
              WHERE status = 'updated'
                AND updated_at >= $1::timestamptz AND updated_at < $2::timestamptz
            )::text AS reschedule_actions
           FROM appointment_records
           WHERE deleted_at IS NULL
             AND record_at >= $1::timestamptz AND record_at < $2::timestamptz`,
          [from, toExclusive],
        ),
        pool.query<{ count: string }>(
          `SELECT COUNT(*)::text AS count
           FROM appointment_records
           WHERE deleted_at IS NULL
             AND created_at >= $1::timestamptz AND created_at < $2::timestamptz`,
          [from, toExclusive],
        ),
      ]);
      const cancellations30dResult = await pool.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count
         FROM appointment_records
         WHERE deleted_at IS NULL
           AND status = 'canceled'
           AND ${CANCELLATION_LAST_EVENT_EXCLUSION_SQL}
           AND updated_at >= NOW() - INTERVAL '30 days'`
      );
      const row = rangeResult.rows[0];
      const row30 = cancellations30dResult.rows[0];
      return {
        pastVisitsInPeriod: row ? parseInt(row.past_visits, 10) : 0,
        cancelledVisitsInPeriod: row ? parseInt(row.cancelled_visits, 10) : 0,
        bookingsCreatedInPeriod: parseInt(bookingsCreatedResult.rows[0]?.count ?? "0", 10) || 0,
        cancellationActionsInPeriod: row ? parseInt(row.cancellation_actions, 10) : 0,
        rescheduleActionsInPeriod: row ? parseInt(row.reschedule_actions, 10) : 0,
        total: row ? parseInt(row.total, 10) : 0,
        cancellations30d: row30 ? parseInt(row30.count, 10) : 0,
      };
    },

    async getDashboardAppointmentMetrics(): Promise<DoctorDashboardAppointmentMetrics> {
      const pool = getPool();
      const [futureR, monthR, cancelR] = await Promise.all([
        pool.query<{ c: string }>(
          `SELECT COUNT(*)::text AS c FROM appointment_records ar
           WHERE ${AR_ACTIVE_UPCOMING_SQL}`
        ),
        pool.query<{ c: string }>(
          `SELECT COUNT(*)::text AS c FROM appointment_records
           WHERE deleted_at IS NULL
             AND record_at IS NOT NULL
             AND record_at >= date_trunc('month', NOW())
             AND record_at < date_trunc('month', NOW()) + interval '1 month'`
        ),
        pool.query<{ c: string }>(
          `SELECT COUNT(*)::text AS c FROM appointment_records ar
           WHERE ar.deleted_at IS NULL
             AND ar.status = 'canceled'
             AND ${AR_CANCELLATION_LAST_EVENT_EXCLUSION_SQL}
             AND ar.updated_at >= date_trunc('month', NOW())
             AND ar.updated_at < date_trunc('month', NOW()) + interval '1 month'`
        ),
      ]);
      return {
        futureActiveCount: parseInt(futureR.rows[0]?.c ?? "0", 10),
        recordsInCalendarMonthTotal: parseInt(monthR.rows[0]?.c ?? "0", 10),
        cancellationsInCalendarMonth: parseInt(cancelR.rows[0]?.c ?? "0", 10),
      };
    },
  };
}
