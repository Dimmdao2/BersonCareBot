import { and, avg, count, desc, eq, sql } from "drizzle-orm";
import { getPool } from "@/infra/db/client";
import { resolveMaterialRatingTargetVideoMediaIds } from "@/infra/repos/materialRatingTargetVideoMediaIds";
import { getDrizzle } from "@/app-layer/db/drizzle";
import { appendSqlExcludeUserIds, drizzleExcludeUserIdColumn } from "@/modules/analytics/analyticsAudience";
import { materialRatings } from "../../../db/schema/materialRatings";
import type { MaterialRatingPort } from "@/modules/material-rating/ports";
import type {
  MaterialRatingAggregate,
  MaterialRatingDoctorDetailDay,
  MaterialRatingDoctorDetailRater,
  MaterialRatingDoctorSummaryRow,
} from "@/modules/material-rating/types";

function emptyDistribution(): Record<number, number> {
  return { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
}

function buildDistributionFromRow(r: {
  c1: number;
  c2: number;
  c3: number;
  c4: number;
  c5: number;
}): Record<number, number> {
  return { 1: r.c1, 2: r.c2, 3: r.c3, 4: r.c4, 5: r.c5 };
}

export function createPgMaterialRatingPort(): MaterialRatingPort {
  return {
    async upsertRating(input) {
      const db = getDrizzle();
      const now = new Date().toISOString();
      await db
        .insert(materialRatings)
        .values({
          userId: input.userId,
          targetKind: input.targetKind,
          targetId: input.targetId,
          stars: input.stars,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [materialRatings.userId, materialRatings.targetKind, materialRatings.targetId],
          set: {
            stars: input.stars,
            updatedAt: now,
          },
        });
    },

    async getMyRating(input) {
      const db = getDrizzle();
      const rows = await db
        .select({ stars: materialRatings.stars })
        .from(materialRatings)
        .where(
          and(
            eq(materialRatings.userId, input.userId),
            eq(materialRatings.targetKind, input.targetKind),
            eq(materialRatings.targetId, input.targetId),
          ),
        )
        .limit(1);
      return rows[0]?.stars ?? null;
    },

    async getAggregate(input) {
      const db = getDrizzle();
      const userExclude = drizzleExcludeUserIdColumn(materialRatings.userId, input.excludedUserIds ?? []);
      const [row] = await db
        .select({
          cnt: count(),
          avgStars: avg(materialRatings.stars),
          c1: sql<number>`coalesce(sum(CASE WHEN ${materialRatings.stars} = 1 THEN 1 ELSE 0 END), 0)::int`,
          c2: sql<number>`coalesce(sum(CASE WHEN ${materialRatings.stars} = 2 THEN 1 ELSE 0 END), 0)::int`,
          c3: sql<number>`coalesce(sum(CASE WHEN ${materialRatings.stars} = 3 THEN 1 ELSE 0 END), 0)::int`,
          c4: sql<number>`coalesce(sum(CASE WHEN ${materialRatings.stars} = 4 THEN 1 ELSE 0 END), 0)::int`,
          c5: sql<number>`coalesce(sum(CASE WHEN ${materialRatings.stars} = 5 THEN 1 ELSE 0 END), 0)::int`,
        })
        .from(materialRatings)
        .where(
          and(
            eq(materialRatings.targetKind, input.targetKind),
            eq(materialRatings.targetId, input.targetId),
            userExclude,
          ),
        );

      const cnt = Number(row?.cnt ?? 0);
      const avgVal = row?.avgStars != null ? Number(row.avgStars) : null;
      const out: MaterialRatingAggregate = {
        count: cnt,
        avg: cnt === 0 ? null : avgVal,
        distribution: row ? buildDistributionFromRow(row) : emptyDistribution(),
      };
      return out;
    },

    async listDoctorSummary(input) {
      const db = getDrizzle();
      const userExclude = drizzleExcludeUserIdColumn(materialRatings.userId, input.excludedUserIds ?? []);
      const cntExpr = count(materialRatings.id);
      const rows = await db
        .select({
          targetKind: materialRatings.targetKind,
          targetId: materialRatings.targetId,
          cnt: cntExpr,
          avgStars: avg(materialRatings.stars),
          c1: sql<number>`coalesce(sum(CASE WHEN ${materialRatings.stars} = 1 THEN 1 ELSE 0 END), 0)::int`,
          c2: sql<number>`coalesce(sum(CASE WHEN ${materialRatings.stars} = 2 THEN 1 ELSE 0 END), 0)::int`,
          c3: sql<number>`coalesce(sum(CASE WHEN ${materialRatings.stars} = 3 THEN 1 ELSE 0 END), 0)::int`,
          c4: sql<number>`coalesce(sum(CASE WHEN ${materialRatings.stars} = 4 THEN 1 ELSE 0 END), 0)::int`,
          c5: sql<number>`coalesce(sum(CASE WHEN ${materialRatings.stars} = 5 THEN 1 ELSE 0 END), 0)::int`,
        })
        .from(materialRatings)
        .where(
          and(input.targetKind ? eq(materialRatings.targetKind, input.targetKind) : sql`true`, userExclude),
        )
        .groupBy(materialRatings.targetKind, materialRatings.targetId)
        .orderBy(desc(cntExpr))
        .limit(input.limit)
        .offset(input.offset);

      return rows.map((r) => ({
        targetKind: r.targetKind as MaterialRatingDoctorSummaryRow["targetKind"],
        targetId: r.targetId,
        count: Number(r.cnt),
        avg: Number(r.cnt) === 0 ? null : r.avgStars != null ? Number(r.avgStars) : null,
        distribution: buildDistributionFromRow(r),
      }));
    },

    async getDoctorDetail(input): Promise<{
      days: MaterialRatingDoctorDetailDay[];
      raters: MaterialRatingDoctorDetailRater[];
    }> {
      const pool = getPool();
      const excludedUserIds = input.excludedUserIds ?? [];
      const mediaIds = await resolveMaterialRatingTargetVideoMediaIds(input.targetKind, input.targetId);

      const viewByDay = new Map<string, number>();
      if (mediaIds.length > 0) {
        const viewBase = `SELECT (timezone($1::text, first_resolved_at))::date::text AS d,
                  count(*)::int AS c
           FROM media_playback_user_video_first_resolve
           WHERE media_id = ANY($2::uuid[])
             AND first_resolved_at >= $3::timestamptz
             AND first_resolved_at < $4::timestamptz`;
        const viewQ = appendSqlExcludeUserIds(viewBase, "user_id", excludedUserIds, [
          input.iana,
          mediaIds,
          input.startUtcIso,
          input.endExclusiveUtcIso,
        ]);
        const vr = await pool.query<{ d: string; c: number }>(
          `${viewQ.sql} GROUP BY 1`,
          viewQ.params,
        );
        for (const row of vr.rows) {
          if (row.d) viewByDay.set(row.d, row.c);
        }
      }

      const ratingByDay = new Map<string, { cnt: number; avg: number | null }>();
      const ratingBase = `SELECT (timezone($1::text, updated_at))::date::text AS d,
                count(*)::int AS cnt,
                avg(stars::numeric)::text AS avg_stars
         FROM material_ratings
         WHERE target_kind = $2 AND target_id = $3::uuid
           AND updated_at >= $4::timestamptz
           AND updated_at < $5::timestamptz`;
      const ratingQ = appendSqlExcludeUserIds(ratingBase, "user_id", excludedUserIds, [
        input.iana,
        input.targetKind,
        input.targetId,
        input.startUtcIso,
        input.endExclusiveUtcIso,
      ]);
      const rr = await pool.query<{ d: string; cnt: number; avg_stars: string | null }>(
        `${ratingQ.sql} GROUP BY 1`,
        ratingQ.params,
      );
      for (const row of rr.rows) {
        if (!row.d) continue;
        const avgVal =
          row.avg_stars != null && row.avg_stars !== ""
            ? Number.parseFloat(row.avg_stars)
            : null;
        ratingByDay.set(row.d, {
          cnt: row.cnt,
          avg: avgVal != null && Number.isFinite(avgVal) ? avgVal : null,
        });
      }

      const ratersBase = `SELECT mr.user_id::text AS user_id,
                mr.stars,
                mr.updated_at::text AS updated_at,
                COALESCE(
                  NULLIF(trim(pu.display_name), ''),
                  NULLIF(trim(pu.phone_normalized), ''),
                  mr.user_id::text
                ) AS display_label
         FROM material_ratings mr
         LEFT JOIN platform_users pu ON pu.id = mr.user_id
         WHERE mr.target_kind = $1 AND mr.target_id = $2::uuid
           AND mr.updated_at >= $3::timestamptz
           AND mr.updated_at < $4::timestamptz`;
      const ratersQ = appendSqlExcludeUserIds(ratersBase, "mr.user_id", excludedUserIds, [
        input.targetKind,
        input.targetId,
        input.startUtcIso,
        input.endExclusiveUtcIso,
      ]);
      const ratersR = await pool.query<{
        user_id: string;
        stars: number;
        updated_at: string;
        display_label: string;
      }>(
        `${ratersQ.sql} ORDER BY mr.updated_at DESC LIMIT 2000`,
        ratersQ.params,
      );

      const days: MaterialRatingDoctorDetailDay[] = input.dayKeys.map((day) => {
        const v = viewByDay.get(day) ?? 0;
        const r = ratingByDay.get(day);
        return {
          day,
          viewCount: v,
          ratingActivityCount: r?.cnt ?? 0,
          avgStarsInActivity: r?.avg ?? null,
        };
      });

      const raters: MaterialRatingDoctorDetailRater[] = ratersR.rows.map((row) => ({
        userId: row.user_id,
        stars: row.stars,
        updatedAt: row.updated_at,
        displayLabel: row.display_label,
      }));

      return { days, raters };
    },
  };
}
