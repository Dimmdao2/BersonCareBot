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
        rubitime_record_id: string;
        phone_normalized: string | null;
        record_at: Date | null;
        status: string;
        payload_json: { link?: string; url?: string; record_url?: string; service_title?: string };
        user_id: string | null;
        display_name: string | null;
      }>(
        `SELECT
          rr.rubitime_record_id,
          rr.phone_normalized,
          rr.record_at,
          rr.status,
          rr.payload_json,
          pu.id AS user_id,
          pu.display_name
         FROM rubitime_records rr
         LEFT JOIN platform_users pu ON rr.phone_normalized = pu.phone_normalized
         WHERE rr.status != 'canceled'
           AND rr.record_at IS NOT NULL
           AND rr.record_at >= $1::timestamptz
           AND rr.record_at <= $2::timestamptz
         ORDER BY rr.record_at ASC`,
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
          id: row.rubitime_record_id,
          clientUserId: row.user_id ?? "",
          clientLabel: row.display_name ?? "Неизвестный клиент",
          time: formatRecordAt(row.record_at),
          type: (payload.service_title && payload.service_title.trim()) || "Запись",
          status: row.status,
          link,
          cancellationCountForClient: 0,
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
          COUNT(*) FILTER (WHERE status = 'canceled')::text AS cancellations,
          COUNT(*) FILTER (WHERE status = 'updated')::text AS reschedules
         FROM rubitime_records
         WHERE record_at >= $1::timestamptz AND record_at <= $2::timestamptz`,
        [from, to]
      );
      const cancellations30dResult = await pool.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count
         FROM rubitime_records
         WHERE status = 'canceled' AND updated_at >= NOW() - INTERVAL '30 days'`
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
