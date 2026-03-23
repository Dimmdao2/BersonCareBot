import { getPool } from "@/infra/db/client";
import type {
  AppointmentRow,
  AppointmentStats,
  DoctorAppointmentsFilter,
  DoctorAppointmentsPort,
} from "@/modules/doctor-appointments/ports";

function formatRecordAt(recordAt: Date | null): string {
  if (!recordAt) return "";
  const d = new Date(recordAt);
  const h = d.getUTCHours().toString().padStart(2, "0");
  const m = d.getUTCMinutes().toString().padStart(2, "0");
  const day = d.getUTCDate().toString().padStart(2, "0");
  const month = (d.getUTCMonth() + 1).toString().padStart(2, "0");
  return `${h}:${m} ${day}.${month}`;
}

function getDateBounds(range: DoctorAppointmentsFilter["range"]): { from: string; to: string } {
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

export function createPgDoctorAppointmentsPort(): DoctorAppointmentsPort {
  return {
    async listAppointmentsForSpecialist(filter: DoctorAppointmentsFilter): Promise<AppointmentRow[]> {
      const pool = getPool();
      const { from, to } = getDateBounds(filter.range);
      const result = await pool.query<{
        integrator_record_id: string;
        phone_normalized: string | null;
        record_at: Date | null;
        status: string;
        payload_json: { link?: string; url?: string; record_url?: string; service_title?: string };
        user_id: string | null;
        display_name: string | null;
        branch_name: string | null;
      }>(
        `SELECT
          ar.integrator_record_id,
          ar.phone_normalized,
          ar.record_at,
          ar.status,
          ar.payload_json,
          pu.id AS user_id,
          COALESCE(pu.display_name, pu.first_name || ' ' || NULLIF(pu.last_name, ''), pu.first_name, pu.last_name) AS display_name,
          b.name AS branch_name
         FROM appointment_records ar
         LEFT JOIN platform_users pu ON ar.phone_normalized = pu.phone_normalized
         LEFT JOIN branches b ON ar.branch_id = b.id
         WHERE ar.status != 'canceled'
           AND ar.record_at IS NOT NULL
           AND ar.record_at >= $1::timestamptz
           AND ar.record_at <= $2::timestamptz
         ORDER BY ar.record_at ASC`,
        [from, to]
      );

      return result.rows.map((row) => {
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
          time: formatRecordAt(row.record_at),
          type: (payload.service_title && payload.service_title.trim()) || "Запись",
          status: row.status,
          link,
          cancellationCountForClient: 0,
          branchName: row.branch_name ?? null,
        };
      });
    },

    async getAppointmentStats(filter: DoctorAppointmentsFilter): Promise<AppointmentStats> {
      const pool = getPool();
      const { from, to } = getDateBounds(filter.range);
      const rangeResult = await pool.query<{
        total: string;
        cancellations: string;
        reschedules: string;
      }>(
        `SELECT
          COUNT(*)::text AS total,
          COUNT(*) FILTER (WHERE status = 'canceled' AND last_event NOT IN ('event-remove-record', 'event-delete-record'))::text AS cancellations,
          COUNT(*) FILTER (WHERE status = 'updated')::text AS reschedules
         FROM appointment_records
         WHERE record_at >= $1::timestamptz AND record_at <= $2::timestamptz`,
        [from, to]
      );
      const cancellations30dResult = await pool.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count
         FROM appointment_records
         WHERE status = 'canceled'
           AND last_event NOT IN ('event-remove-record', 'event-delete-record')
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
  };
}
