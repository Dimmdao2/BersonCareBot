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
import { localDayRangeBoundsIso } from "@/shared/datetime/localDayRangeBounds";
import { resolveAppointmentStatsBounds } from "@/modules/doctor-appointments/resolveAppointmentStatsBounds";

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

function sqlExcludeUsers(excludedUserIds: string[], baseParams: unknown[], userIdExpr: string) {
  if (excludedUserIds.length === 0) {
    return { andSql: "", params: baseParams };
  }
  const idx = baseParams.length + 1;
  return {
    andSql: ` AND ${userIdExpr} <> ALL($${idx}::uuid[])`,
    params: [...baseParams, excludedUserIds],
  };
}

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
    async listMetricAccounts({
      metric,
      period,
      limit,
      offset,
      iana,
      excludedUserIds = [],
      windowHours,
    }) {
      const safeLimit = Math.min(Math.max(1, Math.floor(limit) || 20), 100);
      const safeOffset = Math.max(0, Math.floor(offset) || 0);
      const pool = getPool();
      const orgId = await getDefaultOrganizationId();
      const excluded = excludedUserIds;
      const canonicalUser = "COALESCE(pu.merged_into_id, pu.id)";
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
      const notifHours = Math.min(720, Math.max(1, Math.floor(windowHours ?? 168) || 168));

      const queryByMetric = async (metricKey: DoctorAnalyticsMetricKey): Promise<ListRow[]> => {
        if (metricKey === "appointments_past_visits") {
          const ex = sqlExcludeUsers(
            excluded,
            [orgId, start, endExclusive, [...CANCELLED_BE_STATUSES], safeLimit + 1, safeOffset],
            canonicalUser,
          );
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
               AND a.status <> ALL($4::text[])${ex.andSql}
             ORDER BY a.start_at DESC, user_id ASC
             LIMIT $5::int OFFSET $6::int`,
            ex.params,
          );
          return r.rows;
        }
        if (metricKey === "appointments_cancelled_visits") {
          const ex = sqlExcludeUsers(
            excluded,
            [orgId, start, endExclusive, [...CANCELLED_BE_STATUSES], safeLimit + 1, safeOffset],
            canonicalUser,
          );
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
             ${ex.andSql}
             ORDER BY a.start_at DESC, user_id ASC
             LIMIT $5::int OFFSET $6::int`,
            ex.params,
          );
          return r.rows;
        }
        if (metricKey === "appointments_bookings_created") {
          const ex = sqlExcludeUsers(
            excluded,
            [orgId, start, endExclusive, safeLimit + 1, safeOffset],
            canonicalUser,
          );
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
             ${ex.andSql}
             ORDER BY a.created_at DESC, user_id ASC
             LIMIT $4::int OFFSET $5::int`,
            ex.params,
          );
          return r.rows;
        }
        if (metricKey === "appointments_cancellation_actions") {
          const ex = sqlExcludeUsers(
            excluded,
            [orgId, start, endExclusive, safeLimit + 1, safeOffset],
            canonicalUser,
          );
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
             ${ex.andSql}
             ORDER BY c.created_at DESC, user_id ASC
             LIMIT $4::int OFFSET $5::int`,
            ex.params,
          );
          return r.rows;
        }
        if (metricKey === "appointments_reschedule_actions") {
          const ex = sqlExcludeUsers(
            excluded,
            [orgId, start, endExclusive, safeLimit + 1, safeOffset],
            canonicalUser,
          );
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
             ${ex.andSql}
             ORDER BY r.created_at DESC, user_id ASC
             LIMIT $4::int OFFSET $5::int`,
            ex.params,
          );
          return r.rows;
        }
        if (metricKey === "clients_total") {
          const clientEx = sqlExcludeUsers(
            excluded,
            [safeLimit + 1, safeOffset],
            "pu.id",
          );
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
             ${clientEx.andSql}
             ORDER BY pu.display_name ASC, pu.id ASC
             LIMIT $1::int OFFSET $2::int`,
            clientEx.params,
          );
          return r.rows;
        }
        if (metricKey === "clients_phone_only") {
          const clientEx = sqlExcludeUsers(
            excluded,
            [safeLimit + 1, safeOffset],
            "pu.id",
          );
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
             ${clientEx.andSql}
             ORDER BY pu.display_name ASC, pu.id ASC
             LIMIT $1::int OFFSET $2::int`,
            clientEx.params,
          );
          return r.rows;
        }
        if (metricKey === "clients_app_guests") {
          const clientEx = sqlExcludeUsers(
            excluded,
            [safeLimit + 1, safeOffset],
            "pu.id",
          );
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
             ${clientEx.andSql}
             ORDER BY pu.display_name ASC, pu.id ASC
             LIMIT $1::int OFFSET $2::int`,
            clientEx.params,
          );
          return r.rows;
        }
        if (metricKey === "clients_segment_telegram_only") {
          const clientEx = sqlExcludeUsers(
            excluded,
            [safeLimit + 1, safeOffset],
            "pu.id",
          );
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
             ${clientEx.andSql}
             ORDER BY pu.display_name ASC, pu.id ASC
             LIMIT $1::int OFFSET $2::int`,
            clientEx.params,
          );
          return r.rows;
        }
        if (metricKey === "clients_segment_max_only") {
          const clientEx = sqlExcludeUsers(
            excluded,
            [safeLimit + 1, safeOffset],
            "pu.id",
          );
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
             ${clientEx.andSql}
             ORDER BY pu.display_name ASC, pu.id ASC
             LIMIT $1::int OFFSET $2::int`,
            clientEx.params,
          );
          return r.rows;
        }
        if (metricKey === "clients_segment_email_only") {
          const clientEx = sqlExcludeUsers(
            excluded,
            [safeLimit + 1, safeOffset],
            "pu.id",
          );
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
             ${clientEx.andSql}
             ORDER BY pu.display_name ASC, pu.id ASC
             LIMIT $1::int OFFSET $2::int`,
            clientEx.params,
          );
          return r.rows;
        }
        if (metricKey === "clients_segment_telegram_email") {
          const clientEx = sqlExcludeUsers(
            excluded,
            [safeLimit + 1, safeOffset],
            "pu.id",
          );
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
             ${clientEx.andSql}
             ORDER BY pu.display_name ASC, pu.id ASC
             LIMIT $1::int OFFSET $2::int`,
            clientEx.params,
          );
          return r.rows;
        }
        if (metricKey === "clients_segment_max_email") {
          const clientEx = sqlExcludeUsers(
            excluded,
            [safeLimit + 1, safeOffset],
            "pu.id",
          );
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
             ${clientEx.andSql}
             ORDER BY pu.display_name ASC, pu.id ASC
             LIMIT $1::int OFFSET $2::int`,
            clientEx.params,
          );
          return r.rows;
        }
        if (metricKey === "clients_segment_phone_email_no_messenger") {
          const clientEx = sqlExcludeUsers(
            excluded,
            [safeLimit + 1, safeOffset],
            "pu.id",
          );
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
             ${clientEx.andSql}
             ORDER BY pu.display_name ASC, pu.id ASC
             LIMIT $1::int OFFSET $2::int`,
            clientEx.params,
          );
          return r.rows;
        }
        if (metricKey === "registrations") {
          const ex = sqlExcludeUsers(
            excluded,
            [start, endExclusive, safeLimit + 1, safeOffset],
            canonicalUser,
          );
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
             ${ex.andSql}
             ORDER BY pu.created_at DESC, user_id ASC
             LIMIT $3::int OFFSET $4::int`,
            ex.params,
          );
          return r.rows;
        }
        if (metricKey === "registrations_merges") {
          const ex = sqlExcludeUsers(
            excluded,
            [start, endExclusive, safeLimit + 1, safeOffset],
            canonicalUser,
          );
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
             ${ex.andSql}
             ORDER BY pu.merged_at DESC, user_id ASC
             LIMIT $3::int OFFSET $4::int`,
            ex.params,
          );
          return r.rows;
        }
        if (metricKey === "registrations_combined") {
          const ex = sqlExcludeUsers(
            excluded,
            [start, endExclusive, safeLimit + 1, safeOffset],
            "q.user_id::uuid",
          );
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
             WHERE 1=1${ex.andSql}
             ORDER BY q.event_at DESC, q.user_id ASC
             LIMIT $3::int OFFSET $4::int`,
            ex.params,
          );
          return r.rows;
        }
        if (metricKey === "today_appointments_today") {
          const { from, to } = localDayRangeBoundsIso("today", iana);
          const ex = sqlExcludeUsers(
            excluded,
            [orgId, from, to, safeLimit + 1, safeOffset],
            canonicalUser,
          );
          const r = await pool.query<ListRow>(
            `SELECT
               COALESCE(pu.merged_into_id, pu.id)::text AS user_id,
               pcanon.display_name,
               pcanon.phone_normalized,
               a.start_at::text AS event_at,
               'Запись сегодня'::text AS event_label
             FROM be_appointments a
             INNER JOIN platform_users pu ON pu.id = a.platform_user_id
             INNER JOIN platform_users pcanon ON pcanon.id = COALESCE(pu.merged_into_id, pu.id)
             WHERE a.organization_id = $1::uuid
               AND a.start_at >= $2::timestamptz
               AND a.start_at <= $3::timestamptz${ex.andSql}
             ORDER BY a.start_at DESC, user_id ASC
             LIMIT $4::int OFFSET $5::int`,
            ex.params,
          );
          return r.rows;
        }
        if (metricKey === "today_appointments_week") {
          const { from, toExclusive } = resolveAppointmentStatsBounds({ kind: "range", range: "week" }, iana);
          const ex = sqlExcludeUsers(
            excluded,
            [orgId, from, toExclusive, safeLimit + 1, safeOffset],
            canonicalUser,
          );
          const r = await pool.query<ListRow>(
            `SELECT
               COALESCE(pu.merged_into_id, pu.id)::text AS user_id,
               pcanon.display_name,
               pcanon.phone_normalized,
               a.start_at::text AS event_at,
               'Запись на неделе'::text AS event_label
             FROM be_appointments a
             INNER JOIN platform_users pu ON pu.id = a.platform_user_id
             INNER JOIN platform_users pcanon ON pcanon.id = COALESCE(pu.merged_into_id, pu.id)
             WHERE a.organization_id = $1::uuid
               AND a.start_at >= $2::timestamptz
               AND a.start_at < $3::timestamptz${ex.andSql}
             ORDER BY a.start_at DESC, user_id ASC
             LIMIT $4::int OFFSET $5::int`,
            ex.params,
          );
          return r.rows;
        }
        if (metricKey === "today_cancellations_30d") {
          const ex = sqlExcludeUsers(
            excluded,
            [orgId, [...CANCELLED_BE_STATUSES], safeLimit + 1, safeOffset],
            canonicalUser,
          );
          const r = await pool.query<ListRow>(
            `SELECT
               COALESCE(pu.merged_into_id, pu.id)::text AS user_id,
               pcanon.display_name,
               pcanon.phone_normalized,
               a.updated_at::text AS event_at,
               'Отмена'::text AS event_label
             FROM be_appointments a
             INNER JOIN platform_users pu ON pu.id = a.platform_user_id
             INNER JOIN platform_users pcanon ON pcanon.id = COALESCE(pu.merged_into_id, pu.id)
             WHERE a.organization_id = $1::uuid
               AND a.status = ANY($2::text[])
               AND a.updated_at >= NOW() - interval '30 days'${ex.andSql}
             ORDER BY a.updated_at DESC, user_id ASC
             LIMIT $3::int OFFSET $4::int`,
            ex.params,
          );
          return r.rows;
        }
        if (metricKey === "today_new_clients_no_channels_7d") {
          const clientEx = sqlExcludeUsers(excluded, [7, safeLimit + 1, safeOffset], "pu.id");
          const r = await pool.query<ListRow>(
            `SELECT
               pu.id::text AS user_id,
               pu.display_name,
               pu.phone_normalized,
               pu.created_at::text AS event_at,
               'Новый без каналов'::text AS event_label
             FROM platform_users pu
             WHERE pu.role = 'client'
               AND pu.merged_into_id IS NULL
               AND COALESCE(pu.is_archived, false) = false
               AND pu.created_at >= NOW() - ($1::int * interval '1 day')
               AND NOT EXISTS (
                 SELECT 1
                 FROM user_channel_bindings ucb
                 WHERE ucb.user_id = pu.id
                   AND ucb.channel_code IN ('telegram', 'max')
               )${clientEx.andSql}
             ORDER BY pu.created_at DESC, pu.id ASC
             LIMIT $2::int OFFSET $3::int`,
            clientEx.params,
          );
          return r.rows;
        }
        if (metricKey === "notif_reminders_sent" || metricKey === "notif_reminders_failed") {
          const status = metricKey === "notif_reminders_sent" ? "sent" : "failed";
          const eventLabel = metricKey === "notif_reminders_sent" ? "Отправлено" : "Ошибка";
          const ex = sqlExcludeUsers(
            excluded,
            [notifHours, status, safeLimit + 1, safeOffset],
            "COALESCE(rr.platform_user_id, pu.id)",
          );
          const r = await pool.query<ListRow>(
            `SELECT
               COALESCE(rr.platform_user_id, pu.id)::text AS user_id,
               pcanon.display_name,
               pcanon.phone_normalized,
               MAX(roh.occurred_at)::text AS event_at,
               '${eventLabel}'::text AS event_label
             FROM reminder_occurrence_history roh
             INNER JOIN reminder_rules rr ON rr.integrator_rule_id = roh.integrator_rule_id
             LEFT JOIN platform_users pu
               ON pu.integrator_user_id = rr.integrator_user_id
              AND rr.platform_user_id IS NULL
             INNER JOIN platform_users pcanon
               ON pcanon.id = COALESCE(rr.platform_user_id, pu.id)
             WHERE roh.occurred_at >= (NOW() - ($1::integer * interval '1 hour'))
               AND roh.status = $2::text
               AND COALESCE(rr.platform_user_id, pu.id) IS NOT NULL${ex.andSql}
             GROUP BY 1, 2, 3
             ORDER BY MAX(roh.occurred_at) DESC, user_id ASC
             LIMIT $3::int OFFSET $4::int`,
            ex.params,
          );
          return r.rows;
        }
        if (metricKey === "notif_push_opened") {
          const ex = sqlExcludeUsers(
            excluded,
            [notifHours, safeLimit + 1, safeOffset],
            "e.user_id",
          );
          const r = await pool.query<ListRow>(
            `SELECT
               e.user_id::text AS user_id,
               pu.display_name,
               pu.phone_normalized,
               MAX(e.occurred_at)::text AS event_at,
               'Push open'::text AS event_label
             FROM product_analytics_events_recent e
             INNER JOIN platform_users pu ON pu.id = e.user_id
             WHERE e.event_type = 'push_open'
               AND e.user_id IS NOT NULL
               AND e.occurred_at >= (NOW() - ($1::integer * interval '1 hour'))${ex.andSql}
             GROUP BY e.user_id, pu.display_name, pu.phone_normalized
             ORDER BY MAX(e.occurred_at) DESC, e.user_id ASC
             LIMIT $2::int OFFSET $3::int`,
            ex.params,
          );
          return r.rows;
        }
        if (metricKey === "subscribers_total") {
          const clientEx = sqlExcludeUsers(
            excluded,
            [endExclusive, safeLimit + 1, safeOffset],
            "pu.id",
          );
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
             ${clientEx.andSql}
             ORDER BY s.first_at DESC, pu.id ASC
             LIMIT $2::int OFFSET $3::int`,
            clientEx.params,
          );
          return r.rows;
        }
        if (metricKey !== "subscribers_delta") {
          throw new Error("unsupported_metric");
        }
        const clientEx = sqlExcludeUsers(
          excluded,
          [start, endExclusive, safeLimit + 1, safeOffset],
          "pu.id",
        );
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
             AND s.first_at < $2::timestamptz${clientEx.andSql}
           ORDER BY s.first_at DESC, pu.id ASC
           LIMIT $3::int OFFSET $4::int`,
          clientEx.params,
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
