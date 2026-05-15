import { and, avg, count, desc, eq, sql } from "drizzle-orm";
import { getDrizzle } from "@/app-layer/db/drizzle";
import { materialRatings } from "../../../db/schema/materialRatings";
import type { MaterialRatingPort } from "@/modules/material-rating/ports";
import type { MaterialRatingAggregate, MaterialRatingDoctorSummaryRow } from "@/modules/material-rating/types";

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
        .where(and(eq(materialRatings.targetKind, input.targetKind), eq(materialRatings.targetId, input.targetId)));

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
        .where(input.targetKind ? eq(materialRatings.targetKind, input.targetKind) : sql`true`)
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
  };
}
