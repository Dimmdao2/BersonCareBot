/**
 * Wave 3 phase 13B — domain SQL via `runWebappPgText` (Drizzle `execute(sql)`); no direct `pool.query`.
 */
import { resolveAppointmentStatsBounds } from "@/modules/doctor-appointments/resolveAppointmentStatsBounds";
import { nullableToIsoStringSafe, toIsoStringSafe } from "@/shared/lib/toIsoStringSafe";
import { getAppDisplayTimeZone } from "@/modules/system-settings/appDisplayTimezone";
import { localDayRangeBoundsIso } from "@/shared/datetime/localDayRangeBounds";
import { runWebappPgText } from "@/infra/db/runWebappSql";
import { rubitimeNameIfDifferent } from "@/shared/lib/appointmentRubitimeNameMismatch";
import { SCHEDULE_RECORD_PROVENANCE_PREFIX } from "@/shared/lib/scheduleRecordProvenance";
import type {
  AppointmentBranchPoint,
  AppointmentDayPoint,
  AppointmentRow,
  AppointmentStats,
  DoctorAppointmentStatsFilter,
  DoctorAppointmentsListFilter,
  DoctorAppointmentsPort,
  DoctorDashboardAppointmentMetrics,
  ScheduleKpis,
  ScheduleKpisQuery,
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
      recordAtIso: nullableToIsoStringSafe(row.record_at),
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

function legacyListUserExclusionClause(
  excludedUserIds: string[] | undefined,
  paramIndex: number,
): { clause: string; params: unknown[] } {
  if (!excludedUserIds?.length) return { clause: "", params: [] };
  return {
    clause: ` AND (pu.id IS NULL OR pu.id <> ALL($${paramIndex}::uuid[]))`,
    params: [excludedUserIds],
  };
}

function legacyStatsUserExclusionClause(
  excludedUserIds: string[] | undefined,
  paramIndex: number,
  phoneTable = "appointment_records",
): { clause: string; params: unknown[] } {
  if (!excludedUserIds?.length) return { clause: "", params: [] };
  return {
    clause: ` AND NOT EXISTS (
      SELECT 1 FROM platform_users pu
      WHERE pu.merged_into_id IS NULL
        AND pu.phone_normalized = ${phoneTable}.phone_normalized
        AND pu.id = ANY($${paramIndex}::uuid[])
    )`,
    params: [excludedUserIds],
  };
}

export function createPgDoctorAppointmentsPort(): DoctorAppointmentsPort {
  return {
    async listAppointmentsForSpecialist(
      filter: DoctorAppointmentsListFilter,
      audience?: { excludedUserIds?: string[] },
    ): Promise<AppointmentRow[]> {
      let result: {
        rows: Parameters<typeof mapListRows>[0];
      };

      if (filter.kind === "range") {
        const iana = await getAppDisplayTimeZone();
        const { from, to } = localDayRangeBoundsIso(filter.range, iana);
        const ex = legacyListUserExclusionClause(audience?.excludedUserIds, 3);
        result = await runWebappPgText(
          `${LIST_SELECT}
         FROM appointment_records ar
         LEFT JOIN platform_users pu ON ar.phone_normalized = pu.phone_normalized AND pu.merged_into_id IS NULL
         LEFT JOIN branches b ON ar.branch_id = b.id
         WHERE ar.status != 'canceled'
           AND ar.deleted_at IS NULL
           AND ar.record_at IS NOT NULL
           AND ar.record_at >= $1::timestamptz
           AND ar.record_at <= $2::timestamptz${ex.clause}
         ORDER BY ar.record_at ASC`,
          [from, to, ...ex.params],
        );
      } else if (filter.kind === "statsRange") {
        const iana = await getAppDisplayTimeZone();
        const { from, toExclusive } = resolveAppointmentStatsBounds({ kind: "range", range: filter.range }, iana);
        const ex = legacyListUserExclusionClause(audience?.excludedUserIds, 3);
        result = await runWebappPgText(
          `${LIST_SELECT}
         FROM appointment_records ar
         LEFT JOIN platform_users pu ON ar.phone_normalized = pu.phone_normalized AND pu.merged_into_id IS NULL
         LEFT JOIN branches b ON ar.branch_id = b.id
         WHERE ar.deleted_at IS NULL
           AND ar.record_at IS NOT NULL
           AND ar.record_at >= $1::timestamptz
           AND ar.record_at < $2::timestamptz${ex.clause}
         ORDER BY ar.record_at DESC`,
          [from, toExclusive, ...ex.params],
        );
      } else if (filter.kind === "futureActive") {
        const ex = legacyListUserExclusionClause(audience?.excludedUserIds, 1);
        result = await runWebappPgText(
          `${LIST_SELECT}
         FROM appointment_records ar
         LEFT JOIN platform_users pu ON ar.phone_normalized = pu.phone_normalized AND pu.merged_into_id IS NULL
         LEFT JOIN branches b ON ar.branch_id = b.id
         WHERE ${AR_ACTIVE_UPCOMING_SQL}${ex.clause}
         ORDER BY ar.record_at ASC`,
          ex.params,
        );
      } else if (filter.kind === "recordsInCalendarMonth") {
        const ex = legacyListUserExclusionClause(audience?.excludedUserIds, 1);
        result = await runWebappPgText(
          `${LIST_SELECT}
         FROM appointment_records ar
         LEFT JOIN platform_users pu ON ar.phone_normalized = pu.phone_normalized AND pu.merged_into_id IS NULL
         LEFT JOIN branches b ON ar.branch_id = b.id
         WHERE ar.deleted_at IS NULL
           AND ar.record_at IS NOT NULL
           AND ar.record_at >= date_trunc('month', NOW())
           AND ar.record_at < date_trunc('month', NOW()) + interval '1 month'${ex.clause}
         ORDER BY ar.record_at ASC`,
          ex.params,
        );
      } else if (filter.kind === "past") {
        const limit = filter.limit ?? 50;
        const offset = filter.offset ?? 0;
        const ex = legacyListUserExclusionClause(audience?.excludedUserIds, 3);
        result = await runWebappPgText(
          `${LIST_SELECT}
         FROM appointment_records ar
         LEFT JOIN platform_users pu ON ar.phone_normalized = pu.phone_normalized AND pu.merged_into_id IS NULL
         LEFT JOIN branches b ON ar.branch_id = b.id
         WHERE ar.deleted_at IS NULL
           AND ar.record_at IS NOT NULL
           AND ar.record_at < NOW()
           AND ${AR_CANCELLATION_LAST_EVENT_EXCLUSION_SQL}${ex.clause}
         ORDER BY ar.record_at DESC
         LIMIT $1 OFFSET $2`,
          [limit, offset, ...ex.params],
        );
      } else if (filter.kind === "cancellations30d") {
        const ex = legacyListUserExclusionClause(audience?.excludedUserIds, 1);
        result = await runWebappPgText(
          `${LIST_SELECT}
         FROM appointment_records ar
         LEFT JOIN platform_users pu ON ar.phone_normalized = pu.phone_normalized AND pu.merged_into_id IS NULL
         LEFT JOIN branches b ON ar.branch_id = b.id
         WHERE ar.deleted_at IS NULL
           AND ar.status = 'canceled'
           AND ${AR_CANCELLATION_LAST_EVENT_EXCLUSION_SQL}
           AND ar.updated_at >= NOW() - INTERVAL '30 days'${ex.clause}
         ORDER BY ar.updated_at DESC`,
          ex.params,
        );
      } else {
        const ex = legacyListUserExclusionClause(audience?.excludedUserIds, 1);
        result = await runWebappPgText(
          `${LIST_SELECT}
         FROM appointment_records ar
         LEFT JOIN platform_users pu ON ar.phone_normalized = pu.phone_normalized AND pu.merged_into_id IS NULL
         LEFT JOIN branches b ON ar.branch_id = b.id
         WHERE ar.deleted_at IS NULL
           AND ar.status = 'canceled'
           AND ${AR_CANCELLATION_LAST_EVENT_EXCLUSION_SQL}
           AND ar.updated_at >= date_trunc('month', NOW())
           AND ar.updated_at < date_trunc('month', NOW()) + interval '1 month'${ex.clause}
         ORDER BY ar.updated_at DESC`,
          ex.params,
        );
      }

      return mapListRows(result.rows);
    },

    async getAppointmentStats(
      filter: DoctorAppointmentStatsFilter,
      audience?: { excludedUserIds?: string[] },
    ): Promise<AppointmentStats> {
      const iana = await getAppDisplayTimeZone();
      const { from, toExclusive } = resolveAppointmentStatsBounds(filter, iana);
      const rangeEx = legacyStatsUserExclusionClause(audience?.excludedUserIds, 3);
      const bookingsEx = legacyStatsUserExclusionClause(audience?.excludedUserIds, 3);
      const cancel30Ex = legacyStatsUserExclusionClause(audience?.excludedUserIds, 1);
      const [rangeResult, bookingsCreatedResult] = await Promise.all([
        runWebappPgText<{
          total: string;
          past_visits: string;
          cancelled_visits: string;
          cancellation_actions: string;
          reschedule_actions: string;
        }>(
          `SELECT
            COUNT(*) FILTER (
              WHERE status <> 'canceled'
            )::text AS total,
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
             AND record_at >= $1::timestamptz AND record_at < $2::timestamptz${rangeEx.clause}`,
          [from, toExclusive, ...rangeEx.params],
        ),
        runWebappPgText<{ count: string }>(
          `SELECT COUNT(*)::text AS count
           FROM appointment_records
           WHERE deleted_at IS NULL
             AND created_at >= $1::timestamptz AND created_at < $2::timestamptz${bookingsEx.clause}`,
          [from, toExclusive, ...bookingsEx.params],
        ),
      ]);
      const cancellations30dResult = await runWebappPgText<{ count: string }>(
        `SELECT COUNT(*)::text AS count
         FROM appointment_records
         WHERE deleted_at IS NULL
           AND status = 'canceled'
           AND ${CANCELLATION_LAST_EVENT_EXCLUSION_SQL}
           AND updated_at >= NOW() - INTERVAL '30 days'${cancel30Ex.clause}`,
        cancel30Ex.params,
      );
      // firstVisitInPeriod: appointments in window where phone_normalized has no earlier non-cancelled record
      const firstVisitResult = await runWebappPgText<{ c: string }>(
        `SELECT COUNT(*)::text AS c
         FROM appointment_records a
         WHERE a.deleted_at IS NULL
           AND a.status <> 'canceled'
           AND a.record_at >= $1::timestamptz AND a.record_at < $2::timestamptz
           AND a.phone_normalized IS NOT NULL
           AND NOT EXISTS (
             SELECT 1 FROM appointment_records earlier
             WHERE earlier.deleted_at IS NULL
               AND earlier.status <> 'canceled'
               AND earlier.phone_normalized = a.phone_normalized
               AND (
                 earlier.record_at < a.record_at
                 OR (earlier.record_at = a.record_at AND earlier.integrator_record_id < a.integrator_record_id)
               )
           )${rangeEx.clause}`,
        [from, toExclusive, ...rangeEx.params],
      );
      const row = rangeResult.rows[0];
      const row30 = cancellations30dResult.rows[0];
      const firstVisitCount = parseInt(firstVisitResult.rows[0]?.c ?? "0", 10) || 0;
      const pastVisitsCount = row ? parseInt(row.past_visits, 10) : 0;
      return {
        pastVisitsInPeriod: pastVisitsCount,
        cancelledVisitsInPeriod: row ? parseInt(row.cancelled_visits, 10) : 0,
        bookingsCreatedInPeriod: parseInt(bookingsCreatedResult.rows[0]?.count ?? "0", 10) || 0,
        cancellationActionsInPeriod: row ? parseInt(row.cancellation_actions, 10) : 0,
        rescheduleActionsInPeriod: row ? parseInt(row.reschedule_actions, 10) : 0,
        total: row ? parseInt(row.total, 10) : 0,
        cancellations30d: row30 ? parseInt(row30.count, 10) : 0,
        firstVisitInPeriod: firstVisitCount,
        repeatVisitInPeriod: Math.max(0, pastVisitsCount - firstVisitCount),
      };
    },

    async getDashboardAppointmentMetrics(
      audience?: { excludedUserIds?: string[] },
    ): Promise<DoctorDashboardAppointmentMetrics> {
      const futureEx = legacyStatsUserExclusionClause(audience?.excludedUserIds, 1, "ar");
      const monthEx = legacyStatsUserExclusionClause(audience?.excludedUserIds, 1);
      const cancelEx = legacyStatsUserExclusionClause(audience?.excludedUserIds, 1, "ar");
      const [futureR, monthR, cancelR] = await Promise.all([
        runWebappPgText<{ c: string }>(
          `SELECT COUNT(*)::text AS c FROM appointment_records ar
           WHERE ${AR_ACTIVE_UPCOMING_SQL}${futureEx.clause}`,
          futureEx.params,
        ),
        runWebappPgText<{ c: string }>(
          `SELECT COUNT(*)::text AS c FROM appointment_records
           WHERE deleted_at IS NULL
             AND record_at IS NOT NULL
             AND record_at >= date_trunc('month', NOW())
             AND record_at < date_trunc('month', NOW()) + interval '1 month'${monthEx.clause}`,
          monthEx.params,
        ),
        runWebappPgText<{ c: string }>(
          `SELECT COUNT(*)::text AS c FROM appointment_records ar
           WHERE ar.deleted_at IS NULL
             AND ar.status = 'canceled'
             AND ${AR_CANCELLATION_LAST_EVENT_EXCLUSION_SQL}
             AND ar.updated_at >= date_trunc('month', NOW())
             AND ar.updated_at < date_trunc('month', NOW()) + interval '1 month'${cancelEx.clause}`,
          cancelEx.params,
        ),
      ]);
      return {
        futureActiveCount: parseInt(futureR.rows[0]?.c ?? "0", 10),
        recordsInCalendarMonthTotal: parseInt(monthR.rows[0]?.c ?? "0", 10),
        cancellationsInCalendarMonth: parseInt(cancelR.rows[0]?.c ?? "0", 10),
      };
    },

    // Legacy Rubitime port does not have per-patient analytics; returns zeros for all 9 KPI.
    async getScheduleKpis(
      _query: ScheduleKpisQuery,
      _audience?: { excludedUserIds?: string[] },
    ): Promise<ScheduleKpis> {
      return {
        recordsInPeriod: 0,
        pastInPeriod: 0,
        futureInPeriod: 0,
        bySubscriptionInPeriod: 0,
        firstVisitInPeriod: 0,
        repeatVisitInPeriod: 0,
        uniquePatientsInPeriod: 0,
        cancellationsInPeriod: 0,
        reschedulesInPeriod: 0,
      };
    },

    async getAppointmentDailySeries(
      filter: DoctorAppointmentStatsFilter,
      audience?: { excludedUserIds?: string[] },
    ): Promise<{ daySeries: AppointmentDayPoint[]; branchSeries: AppointmentBranchPoint[] }> {
      const iana = await getAppDisplayTimeZone();
      const { from, toExclusive } = resolveAppointmentStatsBounds(filter, iana);

      const dayEx = legacyStatsUserExclusionClause(audience?.excludedUserIds, 4);
      const bookEx = legacyStatsUserExclusionClause(audience?.excludedUserIds, 4);
      const branchEx = legacyStatsUserExclusionClause(audience?.excludedUserIds, 4, "ar");

      const [dayResult, bookingsResult, branchResult] = await Promise.all([
        runWebappPgText<{ day: string; past_visits: string; cancellation_actions: string }>(
          `SELECT
            to_char(record_at AT TIME ZONE $3, 'YYYY-MM-DD') AS day,
            COUNT(*) FILTER (WHERE status <> 'canceled')::text AS past_visits,
            COUNT(*) FILTER (
              WHERE status = 'canceled'
                AND updated_at >= $1::timestamptz AND updated_at < $2::timestamptz
            )::text AS cancellation_actions
          FROM appointment_records
          WHERE deleted_at IS NULL
            AND record_at >= $1::timestamptz AND record_at < $2::timestamptz${dayEx.clause}
          GROUP BY 1
          ORDER BY 1`,
          [from, toExclusive, iana, ...dayEx.params],
        ),
        runWebappPgText<{ day: string; bookings_created: string }>(
          `SELECT
            to_char(created_at AT TIME ZONE $3, 'YYYY-MM-DD') AS day,
            COUNT(*)::text AS bookings_created
          FROM appointment_records
          WHERE deleted_at IS NULL
            AND created_at >= $1::timestamptz AND created_at < $2::timestamptz${bookEx.clause}
          GROUP BY 1
          ORDER BY 1`,
          [from, toExclusive, iana, ...bookEx.params],
        ),
        runWebappPgText<{ branch_name: string; past_visits: string; cancelled_visits: string }>(
          `SELECT
            COALESCE(b.name, 'Без филиала') AS branch_name,
            COUNT(*) FILTER (WHERE ar.record_at < NOW() AND ar.status <> 'canceled')::text AS past_visits,
            COUNT(*) FILTER (WHERE ar.status = 'canceled')::text AS cancelled_visits
          FROM appointment_records ar
          LEFT JOIN branches b ON ar.branch_id = b.id
          WHERE ar.deleted_at IS NULL
            AND ar.record_at >= $1::timestamptz AND ar.record_at < $2::timestamptz${branchEx.clause}
          GROUP BY 1
          ORDER BY 1`,
          [from, toExclusive, iana, ...branchEx.params],
        ),
      ]);

      // Merge day series with bookings by day key
      const bookingsMap = new Map<string, number>();
      for (const row of bookingsResult.rows) {
        bookingsMap.set(row.day, parseInt(row.bookings_created, 10) || 0);
      }

      // Collect all unique days from both series
      const allDays = new Set<string>();
      for (const row of dayResult.rows) allDays.add(row.day);
      for (const row of bookingsResult.rows) allDays.add(row.day);

      const dayMap = new Map<string, { pastVisits: number; cancellationActions: number }>();
      for (const row of dayResult.rows) {
        dayMap.set(row.day, {
          pastVisits: parseInt(row.past_visits, 10) || 0,
          cancellationActions: parseInt(row.cancellation_actions, 10) || 0,
        });
      }

      const daySeries: AppointmentDayPoint[] = Array.from(allDays)
        .sort()
        .map((day) => {
          const d = dayMap.get(day);
          return {
            day,
            pastVisits: d?.pastVisits ?? 0,
            bookingsCreated: bookingsMap.get(day) ?? 0,
            cancellationActions: d?.cancellationActions ?? 0,
          };
        });

      const branchSeries: AppointmentBranchPoint[] = branchResult.rows.map((row) => ({
        branchName: row.branch_name,
        pastVisits: parseInt(row.past_visits, 10) || 0,
        cancelledVisits: parseInt(row.cancelled_visits, 10) || 0,
      }));

      return { daySeries, branchSeries };
    },
  };
}
