import { getPool } from "@/infra/db/client";
import { appendSqlExcludeUserIds } from "@/modules/analytics/analyticsAudience";
import type { AdminPlatformUserStatsPort } from "@/modules/admin-platform-stats/ports";
import type { QueryResultRow } from "pg";

function withPuExclusion(
  sql: string,
  params: unknown[],
  excludedUserIds: string[],
): { sql: string; params: unknown[] } {
  return appendSqlExcludeUserIds(sql, "pu.id", excludedUserIds, params);
}

/** `pool.query` напрямую: uuid[] в `<> ALL($n::uuid[])` ломается через drizzle `sqlToQuery`. */
async function queryRows<T extends QueryResultRow>(
  pool: ReturnType<typeof getPool>,
  sql: string,
  params: unknown[],
): Promise<T[]> {
  const result = await pool.query<T>(sql, params);
  return result.rows ?? [];
}

function appendExclusionClause(excludedUserIds: string[], params: unknown[]): string {
  if (excludedUserIds.length === 0) return "";
  const idx = params.length + 1;
  params.push(excludedUserIds);
  return ` AND pu.id <> ALL($${idx}::uuid[])`;
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

      const byRegWhere = withPuExclusion(
        `SELECT (timezone($1::text, pu.created_at))::date::text AS d, count(*)::int AS c
           FROM platform_users pu
           WHERE pu.role = 'client'
             AND pu.created_at >= $2::timestamptz AND pu.created_at < $3::timestamptz
             AND NOT (
               pu.merged_at IS NOT NULL
               AND pu.merged_at >= $2::timestamptz AND pu.merged_at < $3::timestamptz
             )`,
        [iana, startUtcIso, endExclusiveUtcIso],
        excludedUserIds,
      );
      const byRegQ = { sql: `${byRegWhere.sql} GROUP BY 1`, params: byRegWhere.params };

      const byMergeWhere = withPuExclusion(
        `SELECT (timezone($1::text, pu.merged_at))::date::text AS d, count(*)::int AS c
           FROM platform_users pu
           WHERE pu.merged_into_id IS NOT NULL
             AND pu.merged_at IS NOT NULL
             AND pu.merged_at >= $2::timestamptz AND pu.merged_at < $3::timestamptz`,
        [iana, startUtcIso, endExclusiveUtcIso],
        excludedUserIds,
      );
      const byMergeQ = { sql: `${byMergeWhere.sql} GROUP BY 1`, params: byMergeWhere.params };

      const [totRegistrations, totMerge, byRegistrations, byMerge] = await Promise.all([
        queryRows<{ c: string }>(pool, totRegQ.sql, totRegQ.params),
        queryRows<{ c: string }>(pool, totMergeQ.sql, totMergeQ.params),
        queryRows<{ d: string; c: number }>(pool, byRegQ.sql, byRegQ.params),
        queryRows<{ d: string; c: number }>(pool, byMergeQ.sql, byMergeQ.params),
      ]);

      const registrationsTotal = Number.parseInt(totRegistrations[0]?.c ?? "0", 10) || 0;
      const mergesTotal = Number.parseInt(totMerge[0]?.c ?? "0", 10) || 0;

      const registrationsByDay = new Map<string, number>();
      for (const row of byRegistrations) {
        if (row.d) registrationsByDay.set(row.d, row.c);
      }
      const mergesByDay = new Map<string, number>();
      for (const row of byMerge) {
        if (row.d) mergesByDay.set(row.d, row.c);
      }

      return { registrationsTotal, mergesTotal, registrationsByDay, mergesByDay };
    },

    async getSubscriberBindingStats({ iana, startUtcIso, endExclusiveUtcIso, excludedUserIds = [] }) {
      const pool = getPool();

      const subscriberFrom = `FROM platform_users pu
             INNER JOIN user_channel_bindings ucb ON ucb.user_id = pu.id
             WHERE pu.role = 'client'
               AND pu.merged_into_id IS NULL
               AND COALESCE(pu.is_archived, false) = false`;

      const beforeParams: unknown[] = [];
      const beforeExclusion = appendExclusionClause(excludedUserIds, beforeParams);
      const beforeStartIdx = beforeParams.length + 1;
      beforeParams.push(startUtcIso);
      const beforeSql = `SELECT count(*)::text AS c
           FROM (
             SELECT pu.id
             ${subscriberFrom}${beforeExclusion}
             GROUP BY pu.id
             HAVING MIN(ucb.created_at) < $${beforeStartIdx}::timestamptz
           ) q`;

      const byDayParams: unknown[] = [];
      const ianaIdx = byDayParams.length + 1;
      byDayParams.push(iana);
      const byDayExclusion = appendExclusionClause(excludedUserIds, byDayParams);
      const byDayStartIdx = byDayParams.length + 1;
      byDayParams.push(startUtcIso);
      const byDayEndIdx = byDayParams.length + 1;
      byDayParams.push(endExclusiveUtcIso);
      const byDaySql = `SELECT (timezone($${ianaIdx}::text, s.first_at))::date::text AS d, count(*)::int AS c
           FROM (
             SELECT pu.id, MIN(ucb.created_at) AS first_at
             ${subscriberFrom}${byDayExclusion}
             GROUP BY pu.id
             HAVING MIN(ucb.created_at) >= $${byDayStartIdx}::timestamptz
               AND MIN(ucb.created_at) < $${byDayEndIdx}::timestamptz
           ) s
           GROUP BY 1`;

      const [beforeRow, byDayRows] = await Promise.all([
        queryRows<{ c: string }>(pool, beforeSql, beforeParams),
        queryRows<{ d: string; c: number }>(pool, byDaySql, byDayParams),
      ]);

      const countBeforeStart = Number.parseInt(beforeRow[0]?.c ?? "0", 10) || 0;
      const newByDay = new Map<string, number>();
      for (const row of byDayRows) {
        if (row.d) newByDay.set(row.d, row.c);
      }

      return { countBeforeStart, newByDay };
    },
  };
}
