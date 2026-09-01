import { sql, type SQL } from 'drizzle-orm';
import { getWebappSqlDb, runWebappSql } from '@/infra/db/runWebappSql';
import { FIO, USER_IDENTITY_FIO_JOIN } from '@/infra/repos/userIdentityFioSql';
import {
  CONTACTS,
  CONTACTS_HAS_PHONE,
  CONTACTS_NO_PHONE,
  USER_CONTACTS_PRIMARY_LATERALS,
} from '@/infra/repos/userContactsSql';
import {
  MIN_REGISTRATION_STATS_INCLUSIVE_DAYS,
  resolveAdminStatsLocalRange,
} from '@/modules/admin-platform-stats/registrationTimeRange';
import type {
  DoctorAnalyticsMetricAccountItem,
  DoctorAnalyticsMetricAccountsPort,
  DoctorAnalyticsMetricKey,
} from '@/modules/doctor-analytics-metric-accounts/ports';
import { localDayRangeBoundsIso } from '@/shared/datetime/localDayRangeBounds';
import { resolveAppointmentStatsBounds } from '@/modules/doctor-appointments/resolveAppointmentStatsBounds';
import {
  sqlActiveMaxBinding,
  sqlActiveMessengerBinding,
  sqlActiveTelegramBinding,
} from '@/modules/doctor-clients/activeMessengerBindingSql';
import { PURGED_CANONICAL_APPOINTMENT_NOT_EXISTS_SQL } from '@/infra/repos/doctorAppointmentPurgeFilter';

/** Exclude staff-purged canonical appointments from calendar-like KPI slices. */
const CANONICAL_PURGED_FILTER_SQL = `
               AND ${PURGED_CANONICAL_APPOINTMENT_NOT_EXISTS_SQL}`;

const CANCELLED_BE_STATUSES = [
  'cancelled_by_patient',
  'cancelled_by_specialist',
  'late_cancellation',
  'no_show',
] as const;

type ListRow = {
  user_id: string;
  display_name: string | null;
  phone_normalized: string | null;
  event_at: string | null;
  event_label: string | null;
};

/**
 * Optional `<> ALL(...)` exclusion predicate. `userIdExpr` is a caller-owned column
 * identifier and stays raw; the excluded id list is bound as one `uuid[]` parameter.
 */
function sqlExcludeUsers(excludedUserIds: string[], userIdExpr: string): SQL {
  if (excludedUserIds.length === 0) {
    return sql``;
  }
  const userId = sql.raw(userIdExpr);
  return sql` AND (${userId} IS NULL OR ${userId} <> ALL(${sql.param(excludedUserIds)}::uuid[]))`;
}

function mapRow(row: ListRow): DoctorAnalyticsMetricAccountItem {
  return {
    userId: row.user_id,
    displayName: row.display_name?.trim() || 'Клиент',
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
      const orgId = await getDefaultOrganizationId();
      const excluded = excludedUserIds;
      const canonicalUser = 'COALESCE(pu.merged_into_id, pu.id)';
      const range = resolveAdminStatsLocalRange(
        iana,
        period.preset,
        period.customFrom,
        period.customTo,
        period.preset === 'custom'
          ? { enforceMinInclusiveDays: MIN_REGISTRATION_STATS_INCLUSIVE_DAYS }
          : undefined,
      );
      const start = range.startUtcIso;
      const endExclusive = range.endExclusiveUtcIso;
      const notifHours = Math.min(720, Math.max(1, Math.floor(windowHours ?? 168) || 168));

      const queryByMetric = async (metricKey: DoctorAnalyticsMetricKey): Promise<ListRow[]> => {
        if (metricKey === 'appointments_past_visits') {
          const ex = sqlExcludeUsers(excluded, canonicalUser);
          const r = await runWebappSql<ListRow>(
            getWebappSqlDb(),
            sql`SELECT
               COALESCE(COALESCE(pu.merged_into_id, pu.id)::text, '') AS user_id,
               COALESCE(COALESCE(ui_pcanon.display_name, pcanon.display_name), NULLIF(a.attribution_json->>'contact_name', ''), a.phone_normalized, 'Клиент') AS display_name,
               COALESCE(pcanon.phone_normalized, a.phone_normalized) AS phone_normalized,
               a.start_at::text AS event_at,
               'Визит'::text AS event_label
             FROM be_appointments a
             LEFT JOIN platform_users pu ON pu.id = a.platform_user_id
             LEFT JOIN platform_users pcanon ON pcanon.id = COALESCE(pu.merged_into_id, pu.id)
             LEFT JOIN user_identity ui_pcanon ON ui_pcanon.platform_user_id = pcanon.id
             WHERE a.organization_id = ${orgId}::uuid
               AND a.start_at >= ${start}::timestamptz
               AND a.start_at < ${endExclusive}::timestamptz
               AND a.start_at < now()
               AND a.status <> ALL(${sql.param([...CANCELLED_BE_STATUSES])}::text[])${sql.raw(CANONICAL_PURGED_FILTER_SQL)}${ex}
             ORDER BY a.start_at DESC, user_id ASC
             LIMIT ${safeLimit + 1}::int OFFSET ${safeOffset}::int`,
          );
          return r.rows;
        }
        if (metricKey === 'appointments_cancelled_visits') {
          const ex = sqlExcludeUsers(excluded, canonicalUser);
          const r = await runWebappSql<ListRow>(
            getWebappSqlDb(),
            sql`SELECT
               COALESCE(COALESCE(pu.merged_into_id, pu.id)::text, '') AS user_id,
               COALESCE(COALESCE(ui_pcanon.display_name, pcanon.display_name), NULLIF(a.attribution_json->>'contact_name', ''), a.phone_normalized, 'Клиент') AS display_name,
               COALESCE(pcanon.phone_normalized, a.phone_normalized) AS phone_normalized,
               a.start_at::text AS event_at,
               'Отменённый визит'::text AS event_label
             FROM be_appointments a
             LEFT JOIN platform_users pu ON pu.id = a.platform_user_id
             LEFT JOIN platform_users pcanon ON pcanon.id = COALESCE(pu.merged_into_id, pu.id)
             LEFT JOIN user_identity ui_pcanon ON ui_pcanon.platform_user_id = pcanon.id
             WHERE a.organization_id = ${orgId}::uuid
               AND a.start_at >= ${start}::timestamptz
               AND a.start_at < ${endExclusive}::timestamptz
               AND a.status = ANY(${sql.param([...CANCELLED_BE_STATUSES])}::text[])${sql.raw(CANONICAL_PURGED_FILTER_SQL)}
             ${ex}
             ORDER BY a.start_at DESC, user_id ASC
             LIMIT ${safeLimit + 1}::int OFFSET ${safeOffset}::int`,
          );
          return r.rows;
        }
        if (metricKey === 'appointments_bookings_created') {
          const ex = sqlExcludeUsers(excluded, canonicalUser);
          const r = await runWebappSql<ListRow>(
            getWebappSqlDb(),
            sql`SELECT
               COALESCE(COALESCE(pu.merged_into_id, pu.id)::text, '') AS user_id,
               COALESCE(COALESCE(ui_pcanon.display_name, pcanon.display_name), NULLIF(a.attribution_json->>'contact_name', ''), a.phone_normalized, 'Клиент') AS display_name,
               COALESCE(pcanon.phone_normalized, a.phone_normalized) AS phone_normalized,
               a.created_at::text AS event_at,
               'Запись создана'::text AS event_label
             FROM be_appointments a
             LEFT JOIN platform_users pu ON pu.id = a.platform_user_id
             LEFT JOIN platform_users pcanon ON pcanon.id = COALESCE(pu.merged_into_id, pu.id)
             LEFT JOIN user_identity ui_pcanon ON ui_pcanon.platform_user_id = pcanon.id
             WHERE a.organization_id = ${orgId}::uuid
               AND a.created_at >= ${start}::timestamptz
               AND a.created_at < ${endExclusive}::timestamptz${sql.raw(CANONICAL_PURGED_FILTER_SQL)}
             ${ex}
             ORDER BY a.created_at DESC, user_id ASC
             LIMIT ${safeLimit + 1}::int OFFSET ${safeOffset}::int`,
          );
          return r.rows;
        }
        if (metricKey === 'appointments_cancellation_actions') {
          const ex = sqlExcludeUsers(excluded, canonicalUser);
          const r = await runWebappSql<ListRow>(
            getWebappSqlDb(),
            sql`SELECT
               COALESCE(COALESCE(pu.merged_into_id, pu.id)::text, '') AS user_id,
               COALESCE(COALESCE(ui_pcanon.display_name, pcanon.display_name), NULLIF(a.attribution_json->>'contact_name', ''), a.phone_normalized, 'Клиент') AS display_name,
               COALESCE(pcanon.phone_normalized, a.phone_normalized) AS phone_normalized,
               c.created_at::text AS event_at,
               'Отмена'::text AS event_label
             FROM be_appointment_cancellations c
             INNER JOIN be_appointments a ON a.id = c.appointment_id
             LEFT JOIN platform_users pu ON pu.id = a.platform_user_id
             LEFT JOIN platform_users pcanon ON pcanon.id = COALESCE(pu.merged_into_id, pu.id)
             LEFT JOIN user_identity ui_pcanon ON ui_pcanon.platform_user_id = pcanon.id
             WHERE c.organization_id = ${orgId}::uuid
               AND c.created_at >= ${start}::timestamptz
               AND c.created_at < ${endExclusive}::timestamptz${sql.raw(CANONICAL_PURGED_FILTER_SQL)}
             ${ex}
             ORDER BY c.created_at DESC, user_id ASC
             LIMIT ${safeLimit + 1}::int OFFSET ${safeOffset}::int`,
          );
          return r.rows;
        }
        if (metricKey === 'appointments_reschedule_actions') {
          const ex = sqlExcludeUsers(excluded, canonicalUser);
          const r = await runWebappSql<ListRow>(
            getWebappSqlDb(),
            sql`SELECT
               COALESCE(COALESCE(pu.merged_into_id, pu.id)::text, '') AS user_id,
               COALESCE(COALESCE(ui_pcanon.display_name, pcanon.display_name), NULLIF(a.attribution_json->>'contact_name', ''), a.phone_normalized, 'Клиент') AS display_name,
               COALESCE(pcanon.phone_normalized, a.phone_normalized) AS phone_normalized,
               r.created_at::text AS event_at,
               'Перенос'::text AS event_label
             FROM be_appointment_reschedules r
             INNER JOIN be_appointments a ON a.id = r.appointment_id
             LEFT JOIN platform_users pu ON pu.id = a.platform_user_id
             LEFT JOIN platform_users pcanon ON pcanon.id = COALESCE(pu.merged_into_id, pu.id)
             LEFT JOIN user_identity ui_pcanon ON ui_pcanon.platform_user_id = pcanon.id
             WHERE r.organization_id = ${orgId}::uuid
               AND r.created_at >= ${start}::timestamptz
               AND r.created_at < ${endExclusive}::timestamptz
             ${ex}
             ORDER BY r.created_at DESC, user_id ASC
             LIMIT ${safeLimit + 1}::int OFFSET ${safeOffset}::int`,
          );
          return r.rows;
        }
        if (metricKey === 'clients_total') {
          const clientEx = sqlExcludeUsers(excluded, 'pu.id');
          const r = await runWebappSql<ListRow>(
            getWebappSqlDb(),
            sql`SELECT
               pu.id::text AS user_id,
               ${sql.raw(FIO.displayName)} AS display_name,
               ${sql.raw(CONTACTS.phoneNormalized)} AS phone_normalized,
               NULL::text AS event_at,
               NULL::text AS event_label
             FROM platform_users pu
             ${sql.raw(USER_IDENTITY_FIO_JOIN)}
             ${sql.raw(USER_CONTACTS_PRIMARY_LATERALS)}
             WHERE pu.role = 'client'
               AND pu.merged_into_id IS NULL
               AND COALESCE(pu.is_archived, false) = false
             ${clientEx}
             ORDER BY display_name ASC, pu.id ASC
             LIMIT ${safeLimit + 1}::int OFFSET ${safeOffset}::int`,
          );
          return r.rows;
        }
        if (metricKey === 'clients_phone_only') {
          const clientEx = sqlExcludeUsers(excluded, 'pu.id');
          const r = await runWebappSql<ListRow>(
            getWebappSqlDb(),
            sql`SELECT
               pu.id::text AS user_id,
               ${sql.raw(FIO.displayName)} AS display_name,
               ${sql.raw(CONTACTS.phoneNormalized)} AS phone_normalized,
               NULL::text AS event_at,
               NULL::text AS event_label
             FROM platform_users pu
             ${sql.raw(USER_IDENTITY_FIO_JOIN)}
             ${sql.raw(USER_CONTACTS_PRIMARY_LATERALS)}
             WHERE pu.role = 'client'
               AND pu.merged_into_id IS NULL
               AND COALESCE(pu.is_archived, false) = false
               AND ${sql.raw(CONTACTS_HAS_PHONE)}
               AND ${sql.raw(CONTACTS.emailVerifiedAt)} IS NULL
               AND NOT ${sql.raw(sqlActiveMessengerBinding('pu.id'))}
             ${clientEx}
             ORDER BY display_name ASC, pu.id ASC
             LIMIT ${safeLimit + 1}::int OFFSET ${safeOffset}::int`,
          );
          return r.rows;
        }
        if (metricKey === 'clients_app_guests') {
          const clientEx = sqlExcludeUsers(excluded, 'pu.id');
          const r = await runWebappSql<ListRow>(
            getWebappSqlDb(),
            sql`SELECT
               pu.id::text AS user_id,
               ${sql.raw(FIO.displayName)} AS display_name,
               ${sql.raw(CONTACTS.phoneNormalized)} AS phone_normalized,
               NULL::text AS event_at,
               NULL::text AS event_label
             FROM platform_users pu
             ${sql.raw(USER_IDENTITY_FIO_JOIN)}
             ${sql.raw(USER_CONTACTS_PRIMARY_LATERALS)}
             WHERE pu.role = 'client'
               AND pu.merged_into_id IS NULL
               AND COALESCE(pu.is_archived, false) = false
               AND ${sql.raw(CONTACTS_NO_PHONE)}
               AND ${sql.raw(CONTACTS.emailVerifiedAt)} IS NULL
               AND NOT ${sql.raw(sqlActiveMessengerBinding('pu.id'))}
             ${clientEx}
             ORDER BY display_name ASC, pu.id ASC
             LIMIT ${safeLimit + 1}::int OFFSET ${safeOffset}::int`,
          );
          return r.rows;
        }
        if (metricKey === 'clients_segment_telegram_only') {
          const clientEx = sqlExcludeUsers(excluded, 'pu.id');
          const r = await runWebappSql<ListRow>(
            getWebappSqlDb(),
            sql`SELECT
               pu.id::text AS user_id,
               ${sql.raw(FIO.displayName)} AS display_name,
               ${sql.raw(CONTACTS.phoneNormalized)} AS phone_normalized,
               NULL::text AS event_at,
               NULL::text AS event_label
             FROM platform_users pu
             ${sql.raw(USER_IDENTITY_FIO_JOIN)}
             ${sql.raw(USER_CONTACTS_PRIMARY_LATERALS)}
             WHERE pu.role = 'client'
               AND pu.merged_into_id IS NULL
               AND COALESCE(pu.is_archived, false) = false
               AND ${sql.raw(sqlActiveTelegramBinding('pu.id'))}
               AND NOT ${sql.raw(sqlActiveMaxBinding('pu.id'))}
               AND ${sql.raw(CONTACTS.emailVerifiedAt)} IS NULL
             ${clientEx}
             ORDER BY display_name ASC, pu.id ASC
             LIMIT ${safeLimit + 1}::int OFFSET ${safeOffset}::int`,
          );
          return r.rows;
        }
        if (metricKey === 'clients_segment_max_only') {
          const clientEx = sqlExcludeUsers(excluded, 'pu.id');
          const r = await runWebappSql<ListRow>(
            getWebappSqlDb(),
            sql`SELECT
               pu.id::text AS user_id,
               ${sql.raw(FIO.displayName)} AS display_name,
               ${sql.raw(CONTACTS.phoneNormalized)} AS phone_normalized,
               NULL::text AS event_at,
               NULL::text AS event_label
             FROM platform_users pu
             ${sql.raw(USER_IDENTITY_FIO_JOIN)}
             ${sql.raw(USER_CONTACTS_PRIMARY_LATERALS)}
             WHERE pu.role = 'client'
               AND pu.merged_into_id IS NULL
               AND COALESCE(pu.is_archived, false) = false
               AND ${sql.raw(sqlActiveMaxBinding('pu.id'))}
               AND NOT ${sql.raw(sqlActiveTelegramBinding('pu.id'))}
               AND ${sql.raw(CONTACTS.emailVerifiedAt)} IS NULL
             ${clientEx}
             ORDER BY display_name ASC, pu.id ASC
             LIMIT ${safeLimit + 1}::int OFFSET ${safeOffset}::int`,
          );
          return r.rows;
        }
        if (metricKey === 'clients_segment_email_only') {
          const clientEx = sqlExcludeUsers(excluded, 'pu.id');
          const r = await runWebappSql<ListRow>(
            getWebappSqlDb(),
            sql`SELECT
               pu.id::text AS user_id,
               ${sql.raw(FIO.displayName)} AS display_name,
               ${sql.raw(CONTACTS.phoneNormalized)} AS phone_normalized,
               NULL::text AS event_at,
               NULL::text AS event_label
             FROM platform_users pu
             ${sql.raw(USER_IDENTITY_FIO_JOIN)}
             ${sql.raw(USER_CONTACTS_PRIMARY_LATERALS)}
             WHERE pu.role = 'client'
               AND pu.merged_into_id IS NULL
               AND COALESCE(pu.is_archived, false) = false
               AND ${sql.raw(CONTACTS.emailVerifiedAt)} IS NOT NULL
               AND ${sql.raw(CONTACTS_NO_PHONE)}
               AND NOT ${sql.raw(sqlActiveMessengerBinding('pu.id'))}
             ${clientEx}
             ORDER BY display_name ASC, pu.id ASC
             LIMIT ${safeLimit + 1}::int OFFSET ${safeOffset}::int`,
          );
          return r.rows;
        }
        if (metricKey === 'clients_segment_telegram_email') {
          const clientEx = sqlExcludeUsers(excluded, 'pu.id');
          const r = await runWebappSql<ListRow>(
            getWebappSqlDb(),
            sql`SELECT
               pu.id::text AS user_id,
               ${sql.raw(FIO.displayName)} AS display_name,
               ${sql.raw(CONTACTS.phoneNormalized)} AS phone_normalized,
               NULL::text AS event_at,
               NULL::text AS event_label
             FROM platform_users pu
             ${sql.raw(USER_IDENTITY_FIO_JOIN)}
             ${sql.raw(USER_CONTACTS_PRIMARY_LATERALS)}
             WHERE pu.role = 'client'
               AND pu.merged_into_id IS NULL
               AND COALESCE(pu.is_archived, false) = false
               AND ${sql.raw(CONTACTS.emailVerifiedAt)} IS NOT NULL
               AND ${sql.raw(sqlActiveTelegramBinding('pu.id'))}
               AND NOT ${sql.raw(sqlActiveMaxBinding('pu.id'))}
             ${clientEx}
             ORDER BY display_name ASC, pu.id ASC
             LIMIT ${safeLimit + 1}::int OFFSET ${safeOffset}::int`,
          );
          return r.rows;
        }
        if (metricKey === 'clients_segment_max_email') {
          const clientEx = sqlExcludeUsers(excluded, 'pu.id');
          const r = await runWebappSql<ListRow>(
            getWebappSqlDb(),
            sql`SELECT
               pu.id::text AS user_id,
               ${sql.raw(FIO.displayName)} AS display_name,
               ${sql.raw(CONTACTS.phoneNormalized)} AS phone_normalized,
               NULL::text AS event_at,
               NULL::text AS event_label
             FROM platform_users pu
             ${sql.raw(USER_IDENTITY_FIO_JOIN)}
             ${sql.raw(USER_CONTACTS_PRIMARY_LATERALS)}
             WHERE pu.role = 'client'
               AND pu.merged_into_id IS NULL
               AND COALESCE(pu.is_archived, false) = false
               AND ${sql.raw(CONTACTS.emailVerifiedAt)} IS NOT NULL
               AND ${sql.raw(sqlActiveMaxBinding('pu.id'))}
               AND NOT ${sql.raw(sqlActiveTelegramBinding('pu.id'))}
             ${clientEx}
             ORDER BY display_name ASC, pu.id ASC
             LIMIT ${safeLimit + 1}::int OFFSET ${safeOffset}::int`,
          );
          return r.rows;
        }
        if (metricKey === 'clients_segment_phone_email_no_messenger') {
          const clientEx = sqlExcludeUsers(excluded, 'pu.id');
          const r = await runWebappSql<ListRow>(
            getWebappSqlDb(),
            sql`SELECT
               pu.id::text AS user_id,
               ${sql.raw(FIO.displayName)} AS display_name,
               ${sql.raw(CONTACTS.phoneNormalized)} AS phone_normalized,
               NULL::text AS event_at,
               NULL::text AS event_label
             FROM platform_users pu
             ${sql.raw(USER_IDENTITY_FIO_JOIN)}
             ${sql.raw(USER_CONTACTS_PRIMARY_LATERALS)}
             WHERE pu.role = 'client'
               AND pu.merged_into_id IS NULL
               AND COALESCE(pu.is_archived, false) = false
               AND ${sql.raw(CONTACTS.emailVerifiedAt)} IS NOT NULL
               AND ${sql.raw(CONTACTS_HAS_PHONE)}
               AND NOT ${sql.raw(sqlActiveMessengerBinding('pu.id'))}
             ${clientEx}
             ORDER BY display_name ASC, pu.id ASC
             LIMIT ${safeLimit + 1}::int OFFSET ${safeOffset}::int`,
          );
          return r.rows;
        }
        if (metricKey === 'registrations') {
          const ex = sqlExcludeUsers(excluded, canonicalUser);
          const r = await runWebappSql<ListRow>(
            getWebappSqlDb(),
            sql`SELECT
               COALESCE(pu.merged_into_id, pu.id)::text AS user_id,
               COALESCE(ui_pcanon.display_name, pcanon.display_name) AS display_name,
               pcanon.phone_normalized,
               pu.created_at::text AS event_at,
               'Регистрация'::text AS event_label
             FROM platform_users pu
             INNER JOIN platform_users pcanon ON pcanon.id = COALESCE(pu.merged_into_id, pu.id)
             WHERE pu.role = 'client'
               AND pu.created_at >= ${start}::timestamptz
               AND pu.created_at < ${endExclusive}::timestamptz
               AND NOT (pu.merged_at IS NOT NULL AND pu.merged_at >= ${start}::timestamptz AND pu.merged_at < ${endExclusive}::timestamptz)
             ${ex}
             ORDER BY pu.created_at DESC, user_id ASC
             LIMIT ${safeLimit + 1}::int OFFSET ${safeOffset}::int`,
          );
          return r.rows;
        }
        if (metricKey === 'registrations_merges') {
          const ex = sqlExcludeUsers(excluded, canonicalUser);
          const r = await runWebappSql<ListRow>(
            getWebappSqlDb(),
            sql`SELECT
               COALESCE(pu.merged_into_id, pu.id)::text AS user_id,
               COALESCE(ui_pcanon.display_name, pcanon.display_name) AS display_name,
               pcanon.phone_normalized,
               pu.merged_at::text AS event_at,
               'Слияние'::text AS event_label
             FROM platform_users pu
             INNER JOIN platform_users pcanon ON pcanon.id = COALESCE(pu.merged_into_id, pu.id)
             WHERE pu.merged_into_id IS NOT NULL
               AND pu.merged_at IS NOT NULL
               AND pu.merged_at >= ${start}::timestamptz
               AND pu.merged_at < ${endExclusive}::timestamptz
             ${ex}
             ORDER BY pu.merged_at DESC, user_id ASC
             LIMIT ${safeLimit + 1}::int OFFSET ${safeOffset}::int`,
          );
          return r.rows;
        }
        if (metricKey === 'registrations_combined') {
          const ex = sqlExcludeUsers(excluded, 'q.user_id::uuid');
          const r = await runWebappSql<ListRow>(
            getWebappSqlDb(),
            sql`SELECT * FROM (
               SELECT
                 COALESCE(pu.merged_into_id, pu.id)::text AS user_id,
                 COALESCE(ui_pcanon.display_name, pcanon.display_name) AS display_name,
                 pcanon.phone_normalized,
                 pu.created_at::text AS event_at,
                 'Регистрация'::text AS event_label
               FROM platform_users pu
               INNER JOIN platform_users pcanon ON pcanon.id = COALESCE(pu.merged_into_id, pu.id)
               WHERE pu.role = 'client'
                 AND pu.created_at >= ${start}::timestamptz
                 AND pu.created_at < ${endExclusive}::timestamptz
                 AND NOT (pu.merged_at IS NOT NULL AND pu.merged_at >= ${start}::timestamptz AND pu.merged_at < ${endExclusive}::timestamptz)
               UNION ALL
               SELECT
                 COALESCE(pu.merged_into_id, pu.id)::text AS user_id,
                 COALESCE(ui_pcanon.display_name, pcanon.display_name) AS display_name,
                 pcanon.phone_normalized,
                 pu.merged_at::text AS event_at,
                 'Слияние'::text AS event_label
               FROM platform_users pu
               INNER JOIN platform_users pcanon ON pcanon.id = COALESCE(pu.merged_into_id, pu.id)
               WHERE pu.merged_into_id IS NOT NULL
                 AND pu.merged_at IS NOT NULL
                 AND pu.merged_at >= ${start}::timestamptz
                 AND pu.merged_at < ${endExclusive}::timestamptz
             ) q
             WHERE 1=1${ex}
             ORDER BY q.event_at DESC, q.user_id ASC
             LIMIT ${safeLimit + 1}::int OFFSET ${safeOffset}::int`,
          );
          return r.rows;
        }
        if (metricKey === 'today_appointments_today') {
          const { from, to } = localDayRangeBoundsIso('today', iana);
          const ex = sqlExcludeUsers(excluded, canonicalUser);
          const r = await runWebappSql<ListRow>(
            getWebappSqlDb(),
            sql`SELECT
               COALESCE(COALESCE(pu.merged_into_id, pu.id)::text, '') AS user_id,
               COALESCE(COALESCE(ui_pcanon.display_name, pcanon.display_name), NULLIF(a.attribution_json->>'contact_name', ''), a.phone_normalized, 'Клиент') AS display_name,
               COALESCE(pcanon.phone_normalized, a.phone_normalized) AS phone_normalized,
               a.start_at::text AS event_at,
               'Запись сегодня'::text AS event_label
             FROM be_appointments a
             LEFT JOIN platform_users pu ON pu.id = a.platform_user_id
             LEFT JOIN platform_users pcanon ON pcanon.id = COALESCE(pu.merged_into_id, pu.id)
             LEFT JOIN user_identity ui_pcanon ON ui_pcanon.platform_user_id = pcanon.id
             WHERE a.organization_id = ${orgId}::uuid
               AND a.start_at >= ${from}::timestamptz
               AND a.start_at <= ${to}::timestamptz
               AND a.status <> ALL(${sql.param([...CANCELLED_BE_STATUSES])}::text[])${sql.raw(CANONICAL_PURGED_FILTER_SQL)}${ex}
             ORDER BY a.start_at DESC, user_id ASC
             LIMIT ${safeLimit + 1}::int OFFSET ${safeOffset}::int`,
          );
          return r.rows;
        }
        if (metricKey === 'today_appointments_week') {
          const { from, toExclusive } = resolveAppointmentStatsBounds(
            { kind: 'range', range: 'week' },
            iana,
          );
          const ex = sqlExcludeUsers(excluded, canonicalUser);
          const r = await runWebappSql<ListRow>(
            getWebappSqlDb(),
            sql`SELECT
               COALESCE(COALESCE(pu.merged_into_id, pu.id)::text, '') AS user_id,
               COALESCE(COALESCE(ui_pcanon.display_name, pcanon.display_name), NULLIF(a.attribution_json->>'contact_name', ''), a.phone_normalized, 'Клиент') AS display_name,
               COALESCE(pcanon.phone_normalized, a.phone_normalized) AS phone_normalized,
               a.start_at::text AS event_at,
               'Запись на неделе'::text AS event_label
             FROM be_appointments a
             LEFT JOIN platform_users pu ON pu.id = a.platform_user_id
             LEFT JOIN platform_users pcanon ON pcanon.id = COALESCE(pu.merged_into_id, pu.id)
             LEFT JOIN user_identity ui_pcanon ON ui_pcanon.platform_user_id = pcanon.id
             WHERE a.organization_id = ${orgId}::uuid
               AND a.start_at >= ${from}::timestamptz
               AND a.start_at < ${toExclusive}::timestamptz
               AND a.status <> ALL(${sql.param([...CANCELLED_BE_STATUSES])}::text[])${sql.raw(CANONICAL_PURGED_FILTER_SQL)}${ex}
             ORDER BY a.start_at DESC, user_id ASC
             LIMIT ${safeLimit + 1}::int OFFSET ${safeOffset}::int`,
          );
          return r.rows;
        }
        if (metricKey === 'today_cancellations_30d') {
          const ex = sqlExcludeUsers(excluded, canonicalUser);
          const r = await runWebappSql<ListRow>(
            getWebappSqlDb(),
            sql`SELECT
               COALESCE(COALESCE(pu.merged_into_id, pu.id)::text, '') AS user_id,
               COALESCE(COALESCE(ui_pcanon.display_name, pcanon.display_name), NULLIF(a.attribution_json->>'contact_name', ''), a.phone_normalized, 'Клиент') AS display_name,
               COALESCE(pcanon.phone_normalized, a.phone_normalized) AS phone_normalized,
               a.updated_at::text AS event_at,
               'Отмена'::text AS event_label
             FROM be_appointments a
             LEFT JOIN platform_users pu ON pu.id = a.platform_user_id
             LEFT JOIN platform_users pcanon ON pcanon.id = COALESCE(pu.merged_into_id, pu.id)
             LEFT JOIN user_identity ui_pcanon ON ui_pcanon.platform_user_id = pcanon.id
             WHERE a.organization_id = ${orgId}::uuid
               AND a.status = ANY(${sql.param([...CANCELLED_BE_STATUSES])}::text[])
               AND a.updated_at >= NOW() - interval '30 days'${sql.raw(CANONICAL_PURGED_FILTER_SQL)}${ex}
             ORDER BY a.updated_at DESC, user_id ASC
             LIMIT ${safeLimit + 1}::int OFFSET ${safeOffset}::int`,
          );
          return r.rows;
        }
        if (
          metricKey === 'clients_messenger_bot_blocked_telegram' ||
          metricKey === 'clients_messenger_bot_blocked_max'
        ) {
          const channel =
            metricKey === 'clients_messenger_bot_blocked_telegram' ? 'telegram' : 'max';
          const clientEx = sqlExcludeUsers(excluded, 'pu.id');
          const r = await runWebappSql<ListRow>(
            getWebappSqlDb(),
            sql`SELECT
               pu.id::text AS user_id,
               ${sql.raw(FIO.displayName)} AS display_name,
               ${sql.raw(CONTACTS.phoneNormalized)} AS phone_normalized,
               ucb.bot_blocked_at::text AS event_at,
               'Бот заблокирован'::text AS event_label
             FROM platform_users pu
             ${sql.raw(USER_IDENTITY_FIO_JOIN)}
             ${sql.raw(USER_CONTACTS_PRIMARY_LATERALS)}
             INNER JOIN user_channel_bindings ucb
               ON ucb.user_id = pu.id
              AND ucb.channel_code = ${channel}::text
              AND ucb.bot_blocked_at IS NOT NULL
             WHERE pu.role = 'client'
               AND pu.merged_into_id IS NULL
               AND COALESCE(pu.is_archived, false) = false
             ${clientEx}
             ORDER BY ucb.bot_blocked_at DESC NULLS LAST, pu.id ASC
             LIMIT ${safeLimit + 1}::int OFFSET ${safeOffset}::int`,
          );
          return r.rows;
        }
        if (metricKey === 'notif_reminders_sent' || metricKey === 'notif_reminders_failed') {
          const status = metricKey === 'notif_reminders_sent' ? 'sent' : 'failed';
          const eventLabel = metricKey === 'notif_reminders_sent' ? 'Отправлено' : 'Ошибка';
          const ex = sqlExcludeUsers(excluded, 'rr.platform_user_id');
          // Track D (#987): the rule's owner is `rr.platform_user_id`. The removed
          // `LEFT JOIN platform_users pu ON <retired public id>` was the pre-canonical fallback;
          // the cutover migration backfills and `NOT NULL`s the owner column.
          const r = await runWebappSql<ListRow>(
            getWebappSqlDb(),
            sql`SELECT
               rr.platform_user_id::text AS user_id,
               COALESCE(ui_pcanon.display_name, pcanon.display_name) AS display_name,
               pcanon.phone_normalized,
               MAX(roh.occurred_at)::text AS event_at,
               ${eventLabel}::text AS event_label
             FROM reminder_occurrence_history roh
             INNER JOIN reminder_rules rr ON rr.integrator_rule_id = roh.integrator_rule_id
             INNER JOIN platform_users pcanon
               ON pcanon.id = rr.platform_user_id
             WHERE roh.occurred_at >= (NOW() - (${notifHours}::integer * interval '1 hour'))
               AND roh.status = ${status}::text
               AND rr.platform_user_id IS NOT NULL${ex}
             GROUP BY 1, 2, 3
             ORDER BY MAX(roh.occurred_at) DESC, user_id ASC
             LIMIT ${safeLimit + 1}::int OFFSET ${safeOffset}::int`,
          );
          return r.rows;
        }
        if (metricKey === 'notif_push_opened') {
          const ex = sqlExcludeUsers(excluded, 'e.user_id');
          const r = await runWebappSql<ListRow>(
            getWebappSqlDb(),
            sql`SELECT
               e.user_id::text AS user_id,
               ${sql.raw(FIO.displayName)} AS display_name,
               ${sql.raw(CONTACTS.phoneNormalized)} AS phone_normalized,
               MAX(e.occurred_at)::text AS event_at,
               'Push open'::text AS event_label
             FROM product_analytics_events_recent e
             INNER JOIN platform_users pu ON pu.id = e.user_id
             ${sql.raw(USER_IDENTITY_FIO_JOIN)}
             ${sql.raw(USER_CONTACTS_PRIMARY_LATERALS)}
             WHERE e.event_type = 'push_open'
               AND e.user_id IS NOT NULL
               AND e.occurred_at >= (NOW() - (${notifHours}::integer * interval '1 hour'))${ex}
             GROUP BY e.user_id, ${sql.raw(FIO.displayName)}, ${sql.raw(CONTACTS.phoneNormalized)}
             ORDER BY MAX(e.occurred_at) DESC, e.user_id ASC
             LIMIT ${safeLimit + 1}::int OFFSET ${safeOffset}::int`,
          );
          return r.rows;
        }
        if (metricKey === 'subscribers_total') {
          const clientEx = sqlExcludeUsers(excluded, 'pu.id');
          const r = await runWebappSql<ListRow>(
            getWebappSqlDb(),
            sql`SELECT
               pu.id::text AS user_id,
               ${sql.raw(FIO.displayName)} AS display_name,
               ${sql.raw(CONTACTS.phoneNormalized)} AS phone_normalized,
               s.first_at::text AS event_at,
               'Первая привязка канала'::text AS event_label
             FROM (
               SELECT ucb.user_id, MIN(ucb.created_at) AS first_at
               FROM user_channel_bindings ucb
               WHERE ucb.channel_code IN ('telegram', 'max')
                 AND ucb.bot_blocked_at IS NULL
               GROUP BY ucb.user_id
             ) s
             INNER JOIN platform_users pu ON pu.id = s.user_id
             ${sql.raw(USER_IDENTITY_FIO_JOIN)}
             ${sql.raw(USER_CONTACTS_PRIMARY_LATERALS)}
             WHERE pu.role = 'client'
               AND pu.merged_into_id IS NULL
               AND COALESCE(pu.is_archived, false) = false
               AND s.first_at < ${endExclusive}::timestamptz
             ${clientEx}
             ORDER BY s.first_at DESC, pu.id ASC
             LIMIT ${safeLimit + 1}::int OFFSET ${safeOffset}::int`,
          );
          return r.rows;
        }
        if (metricKey !== 'subscribers_delta') {
          throw new Error('unsupported_metric');
        }
        const clientEx = sqlExcludeUsers(excluded, 'pu.id');
        const r = await runWebappSql<ListRow>(
          getWebappSqlDb(),
          sql`           SELECT
             pu.id::text AS user_id,
             ${sql.raw(FIO.displayName)} AS display_name,
             ${sql.raw(CONTACTS.phoneNormalized)} AS phone_normalized,
             s.first_at::text AS event_at,
             'Первая привязка канала'::text AS event_label
           FROM (
             SELECT ucb.user_id, MIN(ucb.created_at) AS first_at
             FROM user_channel_bindings ucb
             WHERE ucb.channel_code IN ('telegram', 'max')
               AND ucb.bot_blocked_at IS NULL
             GROUP BY ucb.user_id
           ) s
           INNER JOIN platform_users pu ON pu.id = s.user_id
           ${sql.raw(USER_IDENTITY_FIO_JOIN)}
           ${sql.raw(USER_CONTACTS_PRIMARY_LATERALS)}
           WHERE pu.role = 'client'
             AND pu.merged_into_id IS NULL
             AND COALESCE(pu.is_archived, false) = false
             AND s.first_at >= ${start}::timestamptz
             AND s.first_at < ${endExclusive}::timestamptz${clientEx}
           ORDER BY s.first_at DESC, pu.id ASC
           LIMIT ${safeLimit + 1}::int OFFSET ${safeOffset}::int`,
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
