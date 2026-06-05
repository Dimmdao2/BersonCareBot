import { sql } from "drizzle-orm";
import { getWebappSqlDb, runWebappSql } from "@/infra/db/runWebappSql";
import type { MediaUsageSummary } from "@/modules/media/types";

/** Aggregated usage counts for one library media id (`/api/media/{uuid}`). */
export async function pgMediaUsageSummaryForMediaId(mediaId: string): Promise<MediaUsageSummary> {
  const mediaUrl = `/api/media/${mediaId}`;

  const res = await runWebappSql<{
    materials: string;
    exercises: string;
    clinical_tests: string;
    recommendations: string;
    sections: string;
  }>(
    getWebappSqlDb(),
    sql`SELECT
        (SELECT COUNT(DISTINCT cp.id)::text
           FROM content_pages cp
          WHERE cp.image_url = ${mediaUrl}
             OR cp.video_url = ${mediaUrl}
             OR cp.body_md LIKE '%' || ${mediaUrl} || '%'
             OR cp.body_html LIKE '%' || ${mediaUrl} || '%') AS materials,
        (SELECT COUNT(DISTINCT e.id)::text
           FROM lfk_exercise_media em
           INNER JOIN lfk_exercises e ON e.id = em.exercise_id AND e.is_archived = false
          WHERE em.media_url = ${mediaUrl}) AS exercises,
        (SELECT COUNT(*)::text
           FROM tests t
          WHERE t.is_archived = false
            AND EXISTS (
              SELECT 1
                FROM jsonb_array_elements(t.media) elem
               WHERE elem->>'mediaUrl' = ${mediaUrl}
            )) AS clinical_tests,
        (SELECT COUNT(*)::text
           FROM recommendations r
          WHERE r.is_archived = false
            AND EXISTS (
              SELECT 1
                FROM jsonb_array_elements(r.media) elem
               WHERE elem->>'mediaUrl' = ${mediaUrl}
            )) AS recommendations,
        (SELECT COUNT(*)::text
           FROM content_sections cs
          WHERE cs.cover_image_url = ${mediaUrl}
             OR cs.icon_image_url = ${mediaUrl}) AS sections`,
  );

  const row = res.rows[0];
  return {
    materials: Number(row?.materials ?? 0),
    exercises: Number(row?.exercises ?? 0),
    clinicalTests: Number(row?.clinical_tests ?? 0),
    recommendations: Number(row?.recommendations ?? 0),
    sections: Number(row?.sections ?? 0),
  };
}

export { formatMediaUsageSummaryLines } from "@/modules/media/usageSummaryFormat";
