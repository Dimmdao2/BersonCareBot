import { getPool } from "@/infra/db/client";
import type { AdminPlatformUserStatsPort } from "@/modules/admin-platform-stats/ports";

export function createPgAdminPlatformUserStatsPort(): AdminPlatformUserStatsPort {
  return {
    async getRegistrationStats({ iana, startUtcIso, endExclusiveUtcIso, dayKeys: _dayKeys }) {
      const pool = getPool();

      const [totRegistrations, totMerge, byRegistrations, byMerge] = await Promise.all([
        pool.query<{ c: string }>(
          `SELECT count(*)::text AS c
           FROM platform_users
           WHERE role = 'client'
             AND created_at >= $1::timestamptz AND created_at < $2::timestamptz
             AND NOT (
               merged_at IS NOT NULL
               AND merged_at >= $1::timestamptz AND merged_at < $2::timestamptz
             )`,
          [startUtcIso, endExclusiveUtcIso],
        ),
        pool.query<{ c: string }>(
          `SELECT count(*)::text AS c
           FROM platform_users
           WHERE merged_into_id IS NOT NULL
             AND merged_at IS NOT NULL
             AND merged_at >= $1::timestamptz AND merged_at < $2::timestamptz`,
          [startUtcIso, endExclusiveUtcIso],
        ),
        pool.query<{ d: string; c: number }>(
          `SELECT (timezone($1::text, created_at))::date::text AS d, count(*)::int AS c
           FROM platform_users
           WHERE role = 'client'
             AND created_at >= $2::timestamptz AND created_at < $3::timestamptz
             AND NOT (
               merged_at IS NOT NULL
               AND merged_at >= $2::timestamptz AND merged_at < $3::timestamptz
             )
           GROUP BY 1`,
          [iana, startUtcIso, endExclusiveUtcIso],
        ),
        pool.query<{ d: string; c: number }>(
          `SELECT (timezone($1::text, merged_at))::date::text AS d, count(*)::int AS c
           FROM platform_users
           WHERE merged_into_id IS NOT NULL
             AND merged_at IS NOT NULL
             AND merged_at >= $2::timestamptz AND merged_at < $3::timestamptz
           GROUP BY 1`,
          [iana, startUtcIso, endExclusiveUtcIso],
        ),
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

    async getSubscriberBindingStats({ iana, startUtcIso, endExclusiveUtcIso }) {
      const pool = getPool();

      const [beforeRow, byDayRows] = await Promise.all([
        pool.query<{ c: string }>(
          `SELECT count(*)::text AS c
           FROM (
             SELECT pu.id
             FROM platform_users pu
             INNER JOIN user_channel_bindings ucb ON ucb.user_id = pu.id
             WHERE pu.role = 'client'
               AND pu.merged_into_id IS NULL
               AND COALESCE(pu.is_archived, false) = false
             GROUP BY pu.id
             HAVING MIN(ucb.created_at) < $1::timestamptz
           ) q`,
          [startUtcIso],
        ),
        pool.query<{ d: string; c: number }>(
          `SELECT (timezone($1::text, s.first_at))::date::text AS d, count(*)::int AS c
           FROM (
             SELECT pu.id, MIN(ucb.created_at) AS first_at
             FROM platform_users pu
             INNER JOIN user_channel_bindings ucb ON ucb.user_id = pu.id
             WHERE pu.role = 'client'
               AND pu.merged_into_id IS NULL
               AND COALESCE(pu.is_archived, false) = false
             GROUP BY pu.id
             HAVING MIN(ucb.created_at) >= $2::timestamptz AND MIN(ucb.created_at) < $3::timestamptz
           ) s
           GROUP BY 1`,
          [iana, startUtcIso, endExclusiveUtcIso],
        ),
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
