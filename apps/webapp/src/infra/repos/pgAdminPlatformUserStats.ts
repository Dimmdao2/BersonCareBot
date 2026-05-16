import { getPool } from "@/infra/db/client";
import type { AdminPlatformUserStatsPort } from "@/modules/admin-platform-stats/ports";

export function createPgAdminPlatformUserStatsPort(): AdminPlatformUserStatsPort {
  return {
    async getRegistrationStats({ iana, startUtcIso, endExclusiveUtcIso, dayKeys }) {
      const pool = getPool();

      const [totNew, totMerge, byNew, byMerge] = await Promise.all([
        pool.query<{ c: string }>(
          `SELECT count(*)::text AS c
           FROM platform_users
           WHERE role = 'client'
             AND created_at >= $1::timestamptz AND created_at < $2::timestamptz`,
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

      const newUsersTotal = Number.parseInt(totNew.rows[0]?.c ?? "0", 10) || 0;
      const mergesTotal = Number.parseInt(totMerge.rows[0]?.c ?? "0", 10) || 0;

      const newByDay = new Map<string, number>();
      for (const row of byNew.rows) {
        if (row.d) newByDay.set(row.d, row.c);
      }
      const mergesByDay = new Map<string, number>();
      for (const row of byMerge.rows) {
        if (row.d) mergesByDay.set(row.d, row.c);
      }

      return { newUsersTotal, mergesTotal, newByDay, mergesByDay };
    },
  };
}
