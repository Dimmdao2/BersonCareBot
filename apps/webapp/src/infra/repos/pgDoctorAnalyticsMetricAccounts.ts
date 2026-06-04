import { getPool } from "@/infra/db/client";
import {
  MIN_REGISTRATION_STATS_INCLUSIVE_DAYS,
  resolveAdminStatsLocalRange,
} from "@/modules/admin-platform-stats/registrationTimeRange";
import type {
  DoctorAnalyticsMetricAccountItem,
  DoctorAnalyticsMetricAccountsPort,
  DoctorAnalyticsMetricKey,
} from "@/modules/doctor-analytics-metric-accounts/ports";

const CANCELLED_BE_STATUSES = [
  "cancelled_by_patient",
  "cancelled_by_specialist",
  "late_cancellation",
  "no_show",
] as const;

type ListRow = {
  user_id: string;
  display_name: string | null;
  phone_normalized: string | null;
  event_at: string | null;
  event_label: string | null;
};

function mapRow(row: ListRow): DoctorAnalyticsMetricAccountItem {
  return {
    userId: row.user_id,
    displayName: row.display_name?.trim() || "Клиент",
    phone: row.phone_normalized,
    eventAt: row.event_at,
    eventLabel: row.event_label,
  };
}

export function createPgDoctorAnalyticsMetricAccountsPort(
  getDefaultOrganizationId: () => Promise<string>,
): DoctorAnalyticsMetricAccountsPort {
  return {
    async listMetricAccounts({ metric, period, limit, offset, iana }) {
      const safeLimit = Math.min(Math.max(1, Math.floor(limit) || 20), 100);
      const safeOffset = Math.max(0, Math.floor(offset) || 0);
      const pool = getPool();
      const orgId = await getDefaultOrganizationId();
      const range = resolveAdminStatsLocalRange(
        iana,
        period.preset,
        period.customFrom,
        period.customTo,
        period.preset === "custom"
          ? { enforceMinInclusiveDays: MIN_REGISTRATION_STATS_INCLUSIVE_DAYS }
          : undefined,
      );
      const start = range.startUtcIso;
      const endExclusive = range.endExclusiveUtcIso;

      const queryByMetric = async (metricKey: DoctorAnalyticsMetricKey): Promise<ListRow[]> => {
        if (metricKey === "appointments_past_visits") {
          const r = await pool.query<ListRow>(
            `SELECT
               COALESCE(pu.merged_into_id, pu.id)::text AS user_id,
               pcanon.display_name,
               pcanon.phone_normalized,
               a.start_at::text AS event_at,
               'Визит'::text AS event_label
             FROM be_appointments a
             INNER JOIN platform_users pu ON pu.id = a.platform_user_id
             INNER JOIN platform_users pcanon ON pcanon.id = COALESCE(pu.merged_into_id, pu.id)
             WHERE a.organization_id = $1::uuid
               AND a.start_at >= $2::timestamptz
               AND a.start_at < $3::timestamptz
               AND a.start_at < now()
               AND a.status <> ALL($4::text[])
             ORDER BY a.start_at DESC, user_id ASC
             LIMIT $5::int OFFSET $6::int`,
            [orgId, start, endExclusive, [...CANCELLED_BE_STATUSES], safeLimit + 1, safeOffset],
          );
          return r.rows;
        }
        if (metricKey === "appointments_cancelled_visits") {
          const r = await pool.query<ListRow>(
            `SELECT
               COALESCE(pu.merged_into_id, pu.id)::text AS user_id,
               pcanon.display_name,
               pcanon.phone_normalized,
               a.start_at::text AS event_at,
               'Отменённый визит'::text AS event_label
             FROM be_appointments a
             INNER JOIN platform_users pu ON pu.id = a.platform_user_id
             INNER JOIN platform_users pcanon ON pcanon.id = COALESCE(pu.merged_into_id, pu.id)
             WHERE a.organization_id = $1::uuid
               AND a.start_at >= $2::timestamptz
               AND a.start_at < $3::timestamptz
               AND a.status = ANY($4::text[])
             ORDER BY a.start_at DESC, user_id ASC
             LIMIT $5::int OFFSET $6::int`,
            [orgId, start, endExclusive, [...CANCELLED_BE_STATUSES], safeLimit + 1, safeOffset],
          );
          return r.rows;
        }
        if (metricKey === "appointments_bookings_created") {
          const r = await pool.query<ListRow>(
            `SELECT
               COALESCE(pu.merged_into_id, pu.id)::text AS user_id,
               pcanon.display_name,
               pcanon.phone_normalized,
               a.created_at::text AS event_at,
               'Запись создана'::text AS event_label
             FROM be_appointments a
             INNER JOIN platform_users pu ON pu.id = a.platform_user_id
             INNER JOIN platform_users pcanon ON pcanon.id = COALESCE(pu.merged_into_id, pu.id)
             WHERE a.organization_id = $1::uuid
               AND a.created_at >= $2::timestamptz
               AND a.created_at < $3::timestamptz
             ORDER BY a.created_at DESC, user_id ASC
             LIMIT $4::int OFFSET $5::int`,
            [orgId, start, endExclusive, safeLimit + 1, safeOffset],
          );
          return r.rows;
        }
        if (metricKey === "appointments_cancellation_actions") {
          const r = await pool.query<ListRow>(
            `SELECT
               COALESCE(pu.merged_into_id, pu.id)::text AS user_id,
               pcanon.display_name,
               pcanon.phone_normalized,
               c.created_at::text AS event_at,
               'Отмена'::text AS event_label
             FROM be_appointment_cancellations c
             INNER JOIN be_appointments a ON a.id = c.appointment_id
             INNER JOIN platform_users pu ON pu.id = a.platform_user_id
             INNER JOIN platform_users pcanon ON pcanon.id = COALESCE(pu.merged_into_id, pu.id)
             WHERE c.organization_id = $1::uuid
               AND c.created_at >= $2::timestamptz
               AND c.created_at < $3::timestamptz
             ORDER BY c.created_at DESC, user_id ASC
             LIMIT $4::int OFFSET $5::int`,
            [orgId, start, endExclusive, safeLimit + 1, safeOffset],
          );
          return r.rows;
        }
        if (metricKey === "appointments_reschedule_actions") {
          const r = await pool.query<ListRow>(
            `SELECT
               COALESCE(pu.merged_into_id, pu.id)::text AS user_id,
               pcanon.display_name,
               pcanon.phone_normalized,
               r.created_at::text AS event_at,
               'Перенос'::text AS event_label
             FROM be_appointment_reschedules r
             INNER JOIN be_appointments a ON a.id = r.appointment_id
             INNER JOIN platform_users pu ON pu.id = a.platform_user_id
             INNER JOIN platform_users pcanon ON pcanon.id = COALESCE(pu.merged_into_id, pu.id)
             WHERE r.organization_id = $1::uuid
               AND r.created_at >= $2::timestamptz
               AND r.created_at < $3::timestamptz
             ORDER BY r.created_at DESC, user_id ASC
             LIMIT $4::int OFFSET $5::int`,
            [orgId, start, endExclusive, safeLimit + 1, safeOffset],
          );
          return r.rows;
        }
        if (metricKey === "clients_total") {
          const r = await pool.query<ListRow>(
            `SELECT
               pu.id::text AS user_id,
               pu.display_name,
               pu.phone_normalized,
               NULL::text AS event_at,
               NULL::text AS event_label
             FROM platform_users pu
             WHERE pu.role = 'client'
               AND pu.merged_into_id IS NULL
               AND COALESCE(pu.is_archived, false) = false
             ORDER BY pu.display_name ASC, pu.id ASC
             LIMIT $1::int OFFSET $2::int`,
            [safeLimit + 1, safeOffset],
          );
          return r.rows;
        }
        if (metricKey === "clients_phone_only") {
          const r = await pool.query<ListRow>(
            `SELECT
               pu.id::text AS user_id,
               pu.display_name,
               pu.phone_normalized,
               NULL::text AS event_at,
               NULL::text AS event_label
             FROM platform_users pu
             WHERE pu.role = 'client'
               AND pu.merged_into_id IS NULL
               AND COALESCE(pu.is_archived, false) = false
               AND pu.phone_normalized IS NOT NULL
               AND btrim(pu.phone_normalized) <> ''
               AND pu.email_verified_at IS NULL
               AND NOT EXISTS (
                 SELECT 1 FROM user_channel_bindings ucb
                 WHERE ucb.user_id = pu.id AND ucb.channel_code IN ('telegram', 'max')
               )
             ORDER BY pu.display_name ASC, pu.id ASC
             LIMIT $1::int OFFSET $2::int`,
            [safeLimit + 1, safeOffset],
          );
          return r.rows;
        }
        if (metricKey === "clients_app_guests") {
          const r = await pool.query<ListRow>(
            `SELECT
               pu.id::text AS user_id,
               pu.display_name,
               pu.phone_normalized,
               NULL::text AS event_at,
               NULL::text AS event_label
             FROM platform_users pu
             WHERE pu.role = 'client'
               AND pu.merged_into_id IS NULL
               AND COALESCE(pu.is_archived, false) = false
               AND (pu.phone_normalized IS NULL OR btrim(pu.phone_normalized) = '')
               AND pu.email_verified_at IS NULL
               AND NOT EXISTS (
                 SELECT 1 FROM user_channel_bindings ucb
                 WHERE ucb.user_id = pu.id AND ucb.channel_code IN ('telegram', 'max')
               )
             ORDER BY pu.display_name ASC, pu.id ASC
             LIMIT $1::int OFFSET $2::int`,
            [safeLimit + 1, safeOffset],
          );
          return r.rows;
        }
        if (metricKey === "clients_segment_telegram_only") {
          const r = await pool.query<ListRow>(
            `SELECT
               pu.id::text AS user_id,
               pu.display_name,
               pu.phone_normalized,
               NULL::text AS event_at,
               NULL::text AS event_label
             FROM platform_users pu
             WHERE pu.role = 'client'
               AND pu.merged_into_id IS NULL
               AND COALESCE(pu.is_archived, false) = false
               AND EXISTS (
                 SELECT 1 FROM user_channel_bindings ucb
                 WHERE ucb.user_id = pu.id AND ucb.channel_code = 'telegram'
               )
               AND NOT EXISTS (
                 SELECT 1 FROM user_channel_bindings ucb
                 WHERE ucb.user_id = pu.id AND ucb.channel_code = 'max'
               )
               AND pu.email_verified_at IS NULL
             ORDER BY pu.display_name ASC, pu.id ASC
             LIMIT $1::int OFFSET $2::int`,
            [safeLimit + 1, safeOffset],
          );
          return r.rows;
        }
        if (metricKey === "clients_segment_max_only") {
          const r = await pool.query<ListRow>(
            `SELECT
               pu.id::text AS user_id,
               pu.display_name,
               pu.phone_normalized,
               NULL::text AS event_at,
               NULL::text AS event_label
             FROM platform_users pu
             WHERE pu.role = 'client'
               AND pu.merged_into_id IS NULL
               AND COALESCE(pu.is_archived, false) = false
               AND EXISTS (
                 SELECT 1 FROM user_channel_bindings ucb
                 WHERE ucb.user_id = pu.id AND ucb.channel_code = 'max'
               )
               AND NOT EXISTS (
                 SELECT 1 FROM user_channel_bindings ucb
                 WHERE ucb.user_id = pu.id AND ucb.channel_code = 'telegram'
               )
               AND pu.email_verified_at IS NULL
             ORDER BY pu.display_name ASC, pu.id ASC
             LIMIT $1::int OFFSET $2::int`,
            [safeLimit + 1, safeOffset],
          );
          return r.rows;
        }
        if (metricKey === "clients_segment_email_only") {
          const r = await pool.query<ListRow>(
            `SELECT
               pu.id::text AS user_id,
               pu.display_name,
               pu.phone_normalized,
               NULL::text AS event_at,
               NULL::text AS event_label
             FROM platform_users pu
             WHERE pu.role = 'client'
               AND pu.merged_into_id IS NULL
               AND COALESCE(pu.is_archived, false) = false
               AND pu.email_verified_at IS NOT NULL
               AND (pu.phone_normalized IS NULL OR btrim(pu.phone_normalized) = '')
               AND NOT EXISTS (
                 SELECT 1 FROM user_channel_bindings ucb
                 WHERE ucb.user_id = pu.id AND ucb.channel_code IN ('telegram', 'max')
               )
             ORDER BY pu.display_name ASC, pu.id ASC
             LIMIT $1::int OFFSET $2::int`,
            [safeLimit + 1, safeOffset],
          );
          return r.rows;
        }
        if (metricKey === "clients_segment_telegram_email") {
          const r = await pool.query<ListRow>(
            `SELECT
               pu.id::text AS user_id,
               pu.display_name,
               pu.phone_normalized,
               NULL::text AS event_at,
               NULL::text AS event_label
             FROM platform_users pu
             WHERE pu.role = 'client'
               AND pu.merged_into_id IS NULL
               AND COALESCE(pu.is_archived, false) = false
               AND pu.email_verified_at IS NOT NULL
               AND EXISTS (
                 SELECT 1 FROM user_channel_bindings ucb
                 WHERE ucb.user_id = pu.id AND ucb.channel_code = 'telegram'
               )
               AND NOT EXISTS (
                 SELECT 1 FROM user_channel_bindings ucb
                 WHERE ucb.user_id = pu.id AND ucb.channel_code = 'max'
               )
             ORDER BY pu.display_name ASC, pu.id ASC
             LIMIT $1::int OFFSET $2::int`,
            [safeLimit + 1, safeOffset],
          );
          return r.rows;
        }
        if (metricKey === "clients_segment_max_email") {
          const r = await pool.query<ListRow>(
            `SELECT
               pu.id::text AS user_id,
               pu.display_name,
               pu.phone_normalized,
               NULL::text AS event_at,
               NULL::text AS event_label
             FROM platform_users pu
             WHERE pu.role = 'client'
               AND pu.merged_into_id IS NULL
               AND COALESCE(pu.is_archived, false) = false
               AND pu.email_verified_at IS NOT NULL
               AND EXISTS (
                 SELECT 1 FROM user_channel_bindings ucb
                 WHERE ucb.user_id = pu.id AND ucb.channel_code = 'max'
               )
               AND NOT EXISTS (
                 SELECT 1 FROM user_channel_bindings ucb
                 WHERE ucb.user_id = pu.id AND ucb.channel_code = 'telegram'
               )
             ORDER BY pu.display_name ASC, pu.id ASC
             LIMIT $1::int OFFSET $2::int`,
            [safeLimit + 1, safeOffset],
          );
          return r.rows;
        }
        if (metricKey === "clients_segment_phone_email_no_messenger") {
          const r = await pool.query<ListRow>(
            `SELECT
               pu.id::text AS user_id,
               pu.display_name,
               pu.phone_normalized,
               NULL::text AS event_at,
               NULL::text AS event_label
             FROM platform_users pu
             WHERE pu.role = 'client'
               AND pu.merged_into_id IS NULL
               AND COALESCE(pu.is_archived, false) = false
               AND pu.email_verified_at IS NOT NULL
               AND pu.phone_normalized IS NOT NULL
               AND btrim(pu.phone_normalized) <> ''
               AND NOT EXISTS (
                 SELECT 1 FROM user_channel_bindings ucb
                 WHERE ucb.user_id = pu.id AND ucb.channel_code IN ('telegram', 'max')
               )
             ORDER BY pu.display_name ASC, pu.id ASC
             LIMIT $1::int OFFSET $2::int`,
            [safeLimit + 1, safeOffset],
          );
          return r.rows;
        }
        if (metricKey === "registrations") {
          const r = await pool.query<ListRow>(
            `SELECT
               COALESCE(pu.merged_into_id, pu.id)::text AS user_id,
               pcanon.display_name,
               pcanon.phone_normalized,
               pu.created_at::text AS event_at,
               'Регистрация'::text AS event_label
             FROM platform_users pu
             INNER JOIN platform_users pcanon ON pcanon.id = COALESCE(pu.merged_into_id, pu.id)
             WHERE pu.role = 'client'
               AND pu.created_at >= $1::timestamptz
               AND pu.created_at < $2::timestamptz
               AND NOT (pu.merged_at IS NOT NULL AND pu.merged_at >= $1::timestamptz AND pu.merged_at < $2::timestamptz)
             ORDER BY pu.created_at DESC, user_id ASC
             LIMIT $3::int OFFSET $4::int`,
            [start, endExclusive, safeLimit + 1, safeOffset],
          );
          return r.rows;
        }
        if (metricKey === "registrations_merges") {
          const r = await pool.query<ListRow>(
            `SELECT
               COALESCE(pu.merged_into_id, pu.id)::text AS user_id,
               pcanon.display_name,
               pcanon.phone_normalized,
               pu.merged_at::text AS event_at,
               'Слияние'::text AS event_label
             FROM platform_users pu
             INNER JOIN platform_users pcanon ON pcanon.id = COALESCE(pu.merged_into_id, pu.id)
             WHERE pu.merged_into_id IS NOT NULL
               AND pu.merged_at IS NOT NULL
               AND pu.merged_at >= $1::timestamptz
               AND pu.merged_at < $2::timestamptz
             ORDER BY pu.merged_at DESC, user_id ASC
             LIMIT $3::int OFFSET $4::int`,
            [start, endExclusive, safeLimit + 1, safeOffset],
          );
          return r.rows;
        }
        if (metricKey === "registrations_combined") {
          const r = await pool.query<ListRow>(
            `SELECT * FROM (
               SELECT
                 COALESCE(pu.merged_into_id, pu.id)::text AS user_id,
                 pcanon.display_name,
                 pcanon.phone_normalized,
                 pu.created_at::text AS event_at,
                 'Регистрация'::text AS event_label
               FROM platform_users pu
               INNER JOIN platform_users pcanon ON pcanon.id = COALESCE(pu.merged_into_id, pu.id)
               WHERE pu.role = 'client'
                 AND pu.created_at >= $1::timestamptz
                 AND pu.created_at < $2::timestamptz
                 AND NOT (pu.merged_at IS NOT NULL AND pu.merged_at >= $1::timestamptz AND pu.merged_at < $2::timestamptz)
               UNION ALL
               SELECT
                 COALESCE(pu.merged_into_id, pu.id)::text AS user_id,
                 pcanon.display_name,
                 pcanon.phone_normalized,
                 pu.merged_at::text AS event_at,
                 'Слияние'::text AS event_label
               FROM platform_users pu
               INNER JOIN platform_users pcanon ON pcanon.id = COALESCE(pu.merged_into_id, pu.id)
               WHERE pu.merged_into_id IS NOT NULL
                 AND pu.merged_at IS NOT NULL
                 AND pu.merged_at >= $1::timestamptz
                 AND pu.merged_at < $2::timestamptz
             ) q
             ORDER BY q.event_at DESC, q.user_id ASC
             LIMIT $3::int OFFSET $4::int`,
            [start, endExclusive, safeLimit + 1, safeOffset],
          );
          return r.rows;
        }
        if (metricKey === "subscribers_total") {
          const r = await pool.query<ListRow>(
            `SELECT
               pu.id::text AS user_id,
               pu.display_name,
               pu.phone_normalized,
               s.first_at::text AS event_at,
               'Первая привязка канала'::text AS event_label
             FROM (
               SELECT ucb.user_id, MIN(ucb.created_at) AS first_at
               FROM user_channel_bindings ucb
               GROUP BY ucb.user_id
             ) s
             INNER JOIN platform_users pu ON pu.id = s.user_id
             WHERE pu.role = 'client'
               AND pu.merged_into_id IS NULL
               AND COALESCE(pu.is_archived, false) = false
               AND s.first_at < $1::timestamptz
             ORDER BY s.first_at DESC, pu.id ASC
             LIMIT $2::int OFFSET $3::int`,
            [endExclusive, safeLimit + 1, safeOffset],
          );
          return r.rows;
        }
        if (metricKey !== "subscribers_delta") {
          throw new Error("unsupported_metric");
        }
        const r = await pool.query<ListRow>(
          `SELECT
             pu.id::text AS user_id,
             pu.display_name,
             pu.phone_normalized,
             s.first_at::text AS event_at,
             'Первая привязка канала'::text AS event_label
           FROM (
             SELECT ucb.user_id, MIN(ucb.created_at) AS first_at
             FROM user_channel_bindings ucb
             GROUP BY ucb.user_id
           ) s
           INNER JOIN platform_users pu ON pu.id = s.user_id
           WHERE pu.role = 'client'
             AND pu.merged_into_id IS NULL
             AND COALESCE(pu.is_archived, false) = false
             AND s.first_at >= $1::timestamptz
             AND s.first_at < $2::timestamptz
           ORDER BY s.first_at DESC, pu.id ASC
           LIMIT $3::int OFFSET $4::int`,
          [start, endExclusive, safeLimit + 1, safeOffset],
        );
        return r.rows;
      };

      const rows = await queryByMetric(metric);
      const hasMore = rows.length > safeLimit;
      const sliced = hasMore ? rows.slice(0, safeLimit) : rows;
      return {
        items: sliced.map(mapRow),
        hasMore,
        nextOffset: hasMore ? safeOffset + safeLimit : null,
      };
    },
  };
}
