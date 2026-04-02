import { getPool } from "@/infra/db/client";
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

function getDateBounds(range: DoctorAppointmentStatsFilter["range"]): { from: string; to: string } {
  const now = new Date();
  const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000 - 1);
  const tomorrowStart = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
  const tomorrowEnd = new Date(tomorrowStart.getTime() + 24 * 60 * 60 * 1000 - 1);
  const weekEnd = new Date(todayStart.getTime() + 7 * 24 * 60 * 60 * 1000 - 1);

  if (range === "today") {
    return { from: todayStart.toISOString(), to: todayEnd.toISOString() };
  }
  if (range === "tomorrow") {
    return { from: tomorrowStart.toISOString(), to: tomorrowEnd.toISOString() };
  }
  return { from: todayStart.toISOString(), to: weekEnd.toISOString() };
}

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
    payload_json: { link?: string; url?: string; record_url?: string; service_title?: string };
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
    return {
      id: row.integrator_record_id,
      clientUserId: row.user_id ?? "",
      clientLabel: (row.display_name && row.display_name.trim()) || "Неизвестный клиент",
      time: "",
      recordAtIso: row.record_at ? row.record_at.toISOString() : null,
      type: (payload.service_title && payload.service_title.trim()) || "Запись",
      status: row.status,
      link,
      cancellationCountForClient: 0,
      branchName: row.branch_name ?? null,
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
        const { from, to } = getDateBounds(filter.range);
        result = await pool.query(
          `${LIST_SELECT}
         FROM appointment_records ar
         LEFT JOIN platform_users pu ON ar.phone_normalized = pu.phone_normalized
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
         LEFT JOIN platform_users pu ON ar.phone_normalized = pu.phone_normalized
         LEFT JOIN branches b ON ar.branch_id = b.id
         WHERE ${AR_ACTIVE_UPCOMING_SQL}
         ORDER BY ar.record_at ASC`
        );
      } else if (filter.kind === "recordsInCalendarMonth") {
        result = await pool.query(
          `${LIST_SELECT}
         FROM appointment_records ar
         LEFT JOIN platform_users pu ON ar.phone_normalized = pu.phone_normalized
         LEFT JOIN branches b ON ar.branch_id = b.id
         WHERE ar.deleted_at IS NULL
           AND ar.record_at IS NOT NULL
           AND ar.record_at >= date_trunc('month', NOW())
           AND ar.record_at < date_trunc('month', NOW()) + interval '1 month'
         ORDER BY ar.record_at ASC`
        );
      } else {
        result = await pool.query(
          `${LIST_SELECT}
         FROM appointment_records ar
         LEFT JOIN platform_users pu ON ar.phone_normalized = pu.phone_normalized
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
      const { from, to } = getDateBounds(filter.range);
      const rangeResult = await pool.query<{
        total: string;
        cancellations: string;
        reschedules: string;
      }>(
        `SELECT
          COUNT(*)::text AS total,
          COUNT(*) FILTER (WHERE status = 'canceled' AND ${CANCELLATION_LAST_EVENT_EXCLUSION_SQL})::text AS cancellations,
          COUNT(*) FILTER (WHERE status = 'updated')::text AS reschedules
         FROM appointment_records
         WHERE deleted_at IS NULL
           AND record_at >= $1::timestamptz AND record_at <= $2::timestamptz`,
        [from, to]
      );
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
        total: row ? parseInt(row.total, 10) : 0,
        cancellations: row ? parseInt(row.cancellations, 10) : 0,
        cancellations30d: row30 ? parseInt(row30.count, 10) : 0,
        reschedules: row ? parseInt(row.reschedules, 10) : 0,
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
