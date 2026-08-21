/** Wave 3 phase 15C — doctor detail TZ aggregates via `runWebappPgText`. */
import { and, avg, count, desc, eq, inArray, sql } from 'drizzle-orm';
import {
  getWebappSqlDb,
  runWebappNamedRoot,
  runWebappPgText,
} from '@/infra/db/runWebappSql';
import { resolveMaterialRatingTargetVideoMediaIds } from '@/infra/repos/materialRatingTargetVideoMediaIds';
import { getDrizzle } from '@/app-layer/db/drizzle';
import {
  appendSqlExcludeUserIds,
  drizzleExcludeUserIdColumn,
} from '@/modules/analytics/analyticsAudience';
import { materialRatings } from '../../../db/schema/materialRatings';
import type { MaterialRatingPort } from '@/modules/material-rating/ports';
import type {
  MaterialRatingAggregate,
  MaterialRatingDoctorDetailDay,
  MaterialRatingDoctorDetailRater,
  MaterialRatingDoctorSummaryRow,
} from '@/modules/material-rating/types';

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
      const result = await runWebappNamedRoot<{ updated: boolean }>(
        getWebappSqlDb(),
        'app.upsert_current_patient_material_rating(text,uuid,integer,uuid,uuid)',
        [
          input.targetKind,
          input.targetId,
          input.stars,
          input.programInstanceId ?? null,
          input.programStageItemId ?? null,
        ],
        sql`SELECT updated FROM app.upsert_current_patient_material_rating(
          ${input.targetKind}::text,
          ${input.targetId}::uuid,
          ${input.stars}::integer,
          ${input.programInstanceId ?? null}::uuid,
          ${input.programStageItemId ?? null}::uuid
        )`,
      );
      if (!result.rows[0]?.updated) throw new Error('material_rating organization mismatch');
    },

    async getMyRating(input) {
      const db = getDrizzle();
      const rows = await db
        .select({ stars: materialRatings.stars })
        .from(materialRatings)
        .where(
          and(
            eq(materialRatings.organizationId, input.organizationId),
            eq(materialRatings.userId, input.userId),
            eq(materialRatings.targetKind, input.targetKind),
            eq(materialRatings.targetId, input.targetId),
          ),
        )
        .limit(1);
      return rows[0]?.stars ?? null;
    },

    async getPatientSnapshot(input) {
      const result = await runWebappNamedRoot<{
        rating_count: number | string;
        avg_stars: number | string | null;
        c1: number | string;
        c2: number | string;
        c3: number | string;
        c4: number | string;
        c5: number | string;
        my_stars: number | null;
      }>(
        getWebappSqlDb(),
        'app.read_current_patient_material_rating_snapshot(text,uuid)',
        [input.targetKind, input.targetId],
        sql`SELECT * FROM app.read_current_patient_material_rating_snapshot(
          ${input.targetKind}::text,
          ${input.targetId}::uuid
        )`,
      );
      const row = result.rows[0];
      if (!row) throw new Error('patient material-rating snapshot returned no row');
      const countValue = Number(row.rating_count);
      return {
        aggregate: {
          count: countValue,
          avg: row.avg_stars == null ? null : Number(row.avg_stars),
          distribution: {
            1: Number(row.c1),
            2: Number(row.c2),
            3: Number(row.c3),
            4: Number(row.c4),
            5: Number(row.c5),
          },
        },
        myStars: row.my_stars,
      };
    },

    async getAggregate(input) {
      const db = getDrizzle();
      const userExclude = drizzleExcludeUserIdColumn(
        materialRatings.userId,
        input.excludedUserIds ?? [],
      );
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
            eq(materialRatings.organizationId, input.organizationId),
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

    async listAggregates(input) {
      const result = new Map<string, MaterialRatingAggregate>();
      if (input.targetIds.length === 0) return result;
      const db = getDrizzle();
      const userExclude = drizzleExcludeUserIdColumn(
        materialRatings.userId,
        input.excludedUserIds ?? [],
      );
      const rows = await db
        .select({
          targetId: materialRatings.targetId,
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
            eq(materialRatings.organizationId, input.organizationId),
            eq(materialRatings.targetKind, input.targetKind),
            inArray(materialRatings.targetId, input.targetIds),
            userExclude,
          ),
        )
        .groupBy(materialRatings.targetId);

      for (const r of rows) {
        const cnt = Number(r.cnt ?? 0);
        const avgVal = r.avgStars != null ? Number(r.avgStars) : null;
        result.set(r.targetId, {
          count: cnt,
          avg: cnt === 0 ? null : avgVal,
          distribution: buildDistributionFromRow(r),
        });
      }
      return result;
    },

    async listDoctorSummary(input) {
      const db = getDrizzle();
      const userExclude = drizzleExcludeUserIdColumn(
        materialRatings.userId,
        input.excludedUserIds ?? [],
      );
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
          and(
            eq(materialRatings.organizationId, input.organizationId),
            input.targetKind ? eq(materialRatings.targetKind, input.targetKind) : sql`true`,
            userExclude,
          ),
        )
        .groupBy(materialRatings.targetKind, materialRatings.targetId)
        .orderBy(desc(cntExpr))
        .limit(input.limit)
        .offset(input.offset);

      return rows.map((r) => ({
        targetKind: r.targetKind as MaterialRatingDoctorSummaryRow['targetKind'],
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
      const excludedUserIds = input.excludedUserIds ?? [];
      const mediaIds = await resolveMaterialRatingTargetVideoMediaIds(
        input.targetKind,
        input.targetId,
      );

      const viewByDay = new Map<string, number>();
      if (mediaIds.length > 0) {
        const viewBase = `SELECT (timezone($1::text, first_resolved_at))::date::text AS d,
                  count(*)::int AS c
           FROM media_playback_user_video_first_resolve
           WHERE organization_id = $2::uuid
             AND media_id = ANY($3::uuid[])
             AND first_resolved_at >= $4::timestamptz
             AND first_resolved_at < $5::timestamptz`;
        const viewQ = appendSqlExcludeUserIds(viewBase, 'user_id', excludedUserIds, [
          input.iana,
          input.organizationId,
          mediaIds,
          input.startUtcIso,
          input.endExclusiveUtcIso,
        ]);
        const vr = await runWebappPgText<{ d: string; c: number }>(
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
         WHERE organization_id = $2::uuid
           AND target_kind = $3 AND target_id = $4::uuid
           AND updated_at >= $5::timestamptz
           AND updated_at < $6::timestamptz`;
      const ratingQ = appendSqlExcludeUserIds(ratingBase, 'user_id', excludedUserIds, [
        input.iana,
        input.organizationId,
        input.targetKind,
        input.targetId,
        input.startUtcIso,
        input.endExclusiveUtcIso,
      ]);
      const rr = await runWebappPgText<{ d: string; cnt: number; avg_stars: string | null }>(
        `${ratingQ.sql} GROUP BY 1`,
        ratingQ.params,
      );
      for (const row of rr.rows) {
        if (!row.d) continue;
        const avgVal =
          row.avg_stars != null && row.avg_stars !== '' ? Number.parseFloat(row.avg_stars) : null;
        ratingByDay.set(row.d, {
          cnt: row.cnt,
          avg: avgVal != null && Number.isFinite(avgVal) ? avgVal : null,
        });
      }

      const ratersBase = `SELECT mr.user_id::text AS user_id,
                mr.stars,
                mr.updated_at::text AS updated_at,
                COALESCE(
                  NULLIF(trim(COALESCE(ui.display_name, pu.display_name)), ''),
                  NULLIF(trim((SELECT uc.value_normalized FROM user_contacts uc
                    WHERE uc.platform_user_id = pu.id AND uc.contact_kind = 'phone' AND uc.is_primary = true LIMIT 1)), ''),
                  mr.user_id::text
                ) AS display_label
         FROM material_ratings mr
         LEFT JOIN platform_users pu ON pu.id = mr.user_id
         LEFT JOIN user_identity ui ON ui.platform_user_id = pu.id
         WHERE mr.organization_id = $1::uuid
           AND mr.target_kind = $2 AND mr.target_id = $3::uuid
           AND mr.updated_at >= $4::timestamptz
           AND mr.updated_at < $5::timestamptz`;
      const ratersQ = appendSqlExcludeUserIds(ratersBase, 'mr.user_id', excludedUserIds, [
        input.organizationId,
        input.targetKind,
        input.targetId,
        input.startUtcIso,
        input.endExclusiveUtcIso,
      ]);
      const ratersR = await runWebappPgText<{
        user_id: string;
        stars: number;
        updated_at: string;
        display_label: string;
      }>(`${ratersQ.sql} ORDER BY mr.updated_at DESC LIMIT 2000`, ratersQ.params);

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
