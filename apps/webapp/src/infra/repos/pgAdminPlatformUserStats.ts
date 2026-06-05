import { getPool } from "@/infra/db/client";
import { appendSqlExcludeUserIds } from "@/modules/analytics/analyticsAudience";
import type { AdminPlatformUserStatsPort } from "@/modules/admin-platform-stats/ports";

function withPuExclusion(
  sql: string,
  params: unknown[],
  excludedUserIds: string[],
): { sql: string; params: unknown[] } {
  return appendSqlExcludeUserIds(sql, "pu.id", excludedUserIds, params);
}

export function createPgAdminPlatformUserStatsPort(): AdminPlatformUserStatsPort {
  return {
    async getRegistrationStats({
      iana,
      startUtcIso,
      endExclusiveUtcIso,
      dayKeys: _dayKeys,
      excludedUserIds = [],
    }) {
      const pool = getPool();

      const totRegQ = withPuExclusion(
        `SELECT count(*)::text AS c
           FROM platform_users pu
           WHERE pu.role = 'client'
             AND pu.created_at >= $1::timestamptz AND pu.created_at < $2::timestamptz
             AND NOT (
               pu.merged_at IS NOT NULL
               AND pu.merged_at >= $1::timestamptz AND pu.merged_at < $2::timestamptz
             )`,
        [startUtcIso, endExclusiveUtcIso],
        excludedUserIds,
      );

      const totMergeQ = withPuExclusion(
        `SELECT count(*)::text AS c
           FROM platform_users pu
           WHERE pu.merged_into_id IS NOT NULL
             AND pu.merged_at IS NOT NULL
             AND pu.merged_at >= $1::timestamptz AND pu.merged_at < $2::timestamptz`,
        [startUtcIso, endExclusiveUtcIso],
        excludedUserIds,
      );

      const byRegQ = withPuExclusion(
        `SELECT (timezone($1::text, pu.created_at))::date::text AS d, count(*)::int AS c
           FROM platform_users pu
           WHERE pu.role = 'client'
             AND pu.created_at >= $2::timestamptz AND pu.created_at < $3::timestamptz
             AND NOT (
               pu.merged_at IS NOT NULL
               AND pu.merged_at >= $2::timestamptz AND pu.merged_at < $3::timestamptz
             )
           GROUP BY 1`,
        [iana, startUtcIso, endExclusiveUtcIso],
        excludedUserIds,
      );

      const byMergeQ = withPuExclusion(
        `SELECT (timezone($1::text, pu.merged_at))::date::text AS d, count(*)::int AS c
           FROM platform_users pu
           WHERE pu.merged_into_id IS NOT NULL
             AND pu.merged_at IS NOT NULL
             AND pu.merged_at >= $2::timestamptz AND pu.merged_at < $3::timestamptz
           GROUP BY 1`,
        [iana, startUtcIso, endExclusiveUtcIso],
        excludedUserIds,
      );

      const [totRegistrations, totMerge, byRegistrations, byMerge] = await Promise.all([
        pool.query<{ c: string }>(totRegQ.sql, totRegQ.params),
        pool.query<{ c: string }>(totMergeQ.sql, totMergeQ.params),
        pool.query<{ d: string; c: number }>(byRegQ.sql, byRegQ.params),
        pool.query<{ d: string; c: number }>(byMergeQ.sql, byMergeQ.params),
      ]);

      const registrationsTotal = Number.parseInt(totRegistrations.rows[0]?.c ?? "0", 10) || 0;
      const mergesTotal = Number.parseInt(totMerge.rows[0]?.c ?? "0", 10) || 0;

      const registrationsByDay = new Map<string, number>();
      for (const row of byRegistrations.rows) {
        if (row.d) registrationsByDay.set(row.d, row.c);
      }
      const mergesByDay = new Map<string, number>();
      for (const row of byMerge.rows) {
        if (row.d) mergesByDay.set(row.d, row.c);
      }

      return { registrationsTotal, mergesTotal, registrationsByDay, mergesByDay };
    },

    async getSubscriberBindingStats({ iana, startUtcIso, endExclusiveUtcIso, excludedUserIds = [] }) {
      const pool = getPool();

      const subscriberInnerBase = `SELECT pu.id, MIN(ucb.created_at) AS first_at
             FROM platform_users pu
             INNER JOIN user_channel_bindings ucb ON ucb.user_id = pu.id
             WHERE pu.role = 'client'
               AND pu.merged_into_id IS NULL
               AND COALESCE(pu.is_archived, false) = false`;
      const subscriberInnerQ = withPuExclusion(subscriberInnerBase, [], excludedUserIds);

      const beforeQ = {
        sql: `SELECT count(*)::text AS c
           FROM (
             ${subscriberInnerQ.sql}
             GROUP BY pu.id
             HAVING MIN(ucb.created_at) < $${subscriberInnerQ.params.length + 1}::timestamptz
           ) q`,
        params: [...subscriberInnerQ.params, startUtcIso],
      };

      const byDayQ = {
        sql: `SELECT (timezone($1::text, s.first_at))::date::text AS d, count(*)::int AS c
           FROM (
             ${subscriberInnerQ.sql}
             GROUP BY pu.id
             HAVING MIN(ucb.created_at) >= $${subscriberInnerQ.params.length + 1}::timestamptz
               AND MIN(ucb.created_at) < $${subscriberInnerQ.params.length + 2}::timestamptz
           ) s
           GROUP BY 1`,
        params: [iana, ...subscriberInnerQ.params, startUtcIso, endExclusiveUtcIso],
      };

      const [beforeRow, byDayRows] = await Promise.all([
        pool.query<{ c: string }>(beforeQ.sql, beforeQ.params),
        pool.query<{ d: string; c: number }>(byDayQ.sql, byDayQ.params),
      ]);

      const countBeforeStart = Number.parseInt(beforeRow.rows[0]?.c ?? "0", 10) || 0;
      const newByDay = new Map<string, number>();
      for (const row of byDayRows.rows) {
        if (row.d) newByDay.set(row.d, row.c);
      }

      return { countBeforeStart, newByDay };
    },
  };
}
