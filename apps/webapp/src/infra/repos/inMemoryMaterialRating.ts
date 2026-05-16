import type { MaterialRatingPort } from "@/modules/material-rating/ports";
import type {
  MaterialRatingAggregate,
  MaterialRatingDoctorDetailDay,
  MaterialRatingDoctorDetailRater,
  MaterialRatingDoctorSummaryRow,
  MaterialRatingTargetKind,
} from "@/modules/material-rating/types";
import { DateTime } from "luxon";

type Row = {
  userId: string;
  targetKind: MaterialRatingTargetKind;
  targetId: string;
  stars: number;
  updatedAt: string;
};

function rowKey(u: string, k: MaterialRatingTargetKind, id: string) {
  return `${u}\0${k}\0${id}`;
}

function bump(dist: Record<number, number>, stars: number) {
  const k = stars as 1 | 2 | 3 | 4 | 5;
  dist[k] = (dist[k] ?? 0) + 1;
}

/** In-memory store for Vitest / `webappReposAreInMemory`. */
export function createInMemoryMaterialRatingPort(): MaterialRatingPort {
  const rows = new Map<string, Row>();

  function aggregateFor(targetKind: MaterialRatingTargetKind, targetId: string): MaterialRatingAggregate {
    let cnt = 0;
    let sum = 0;
    const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const r of rows.values()) {
      if (r.targetKind === targetKind && r.targetId === targetId) {
        cnt += 1;
        sum += r.stars;
        bump(distribution, r.stars);
      }
    }
    return {
      count: cnt,
      avg: cnt === 0 ? null : sum / cnt,
      distribution,
    };
  }

  return {
    async upsertRating(input) {
      const now = new Date().toISOString();
      rows.set(rowKey(input.userId, input.targetKind, input.targetId), {
        userId: input.userId,
        targetKind: input.targetKind,
        targetId: input.targetId,
        stars: input.stars,
        updatedAt: now,
      });
    },

    async getMyRating(input) {
      return rows.get(rowKey(input.userId, input.targetKind, input.targetId))?.stars ?? null;
    },

    async getAggregate(input) {
      return aggregateFor(input.targetKind, input.targetId);
    },

    async listDoctorSummary(input) {
      const grouped = new Map<string, { row: MaterialRatingDoctorSummaryRow }>();
      for (const r of rows.values()) {
        if (input.targetKind && r.targetKind !== input.targetKind) continue;
        const gk = `${r.targetKind}\0${r.targetId}`;
        const prev = grouped.get(gk)?.row;
        const distribution = prev
          ? { ...prev.distribution }
          : { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
        bump(distribution, r.stars);
        const nextCount = (prev?.count ?? 0) + 1;
        const nextSum = (prev?.avg != null ? prev.avg * prev.count : 0) + r.stars;
        grouped.set(gk, {
          row: {
            targetKind: r.targetKind,
            targetId: r.targetId,
            count: nextCount,
            avg: nextSum / nextCount,
            distribution,
          },
        });
      }
      const sorted = [...grouped.values()]
        .map((x) => x.row)
        .sort((a, b) => b.count - a.count);
      return sorted.slice(input.offset, input.offset + input.limit);
    },

    async getDoctorDetail(input): Promise<{
      days: MaterialRatingDoctorDetailDay[];
      raters: MaterialRatingDoctorDetailRater[];
    }> {
      const startMs = Date.parse(input.startUtcIso);
      const endMs = Date.parse(input.endExclusiveUtcIso);
      const zone = input.iana;

      const matching = [...rows.values()].filter(
        (r) =>
          r.targetKind === input.targetKind &&
          r.targetId === input.targetId &&
          Date.parse(r.updatedAt) >= startMs &&
          Date.parse(r.updatedAt) < endMs,
      );

      const ratingByDay = new Map<string, { cnt: number; sum: number }>();
      for (const r of matching) {
        const day = DateTime.fromISO(r.updatedAt, { zone: "utc" }).setZone(zone).toFormat("yyyy-LL-dd");
        const prev = ratingByDay.get(day);
        if (prev) {
          prev.cnt += 1;
          prev.sum += r.stars;
        } else {
          ratingByDay.set(day, { cnt: 1, sum: r.stars });
        }
      }

      const days: MaterialRatingDoctorDetailDay[] = input.dayKeys.map((day) => {
        const agg = ratingByDay.get(day);
        return {
          day,
          viewCount: 0,
          ratingActivityCount: agg?.cnt ?? 0,
          avgStarsInActivity:
            agg != null && agg.cnt > 0 ? Math.round((agg.sum / agg.cnt) * 100) / 100 : null,
        };
      });

      const raters: MaterialRatingDoctorDetailRater[] = [...matching]
        .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
        .map((r) => ({
          userId: r.userId,
          stars: r.stars,
          updatedAt: r.updatedAt,
          displayLabel: r.userId,
        }));

      return { days, raters };
    },
  };
}
