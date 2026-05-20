import { getPool } from "@/infra/db/client";
import type { MediaUsageSummary } from "@/modules/media/types";

/** Aggregated usage counts for one library media id (`/api/media/{uuid}`). */
export async function pgMediaUsageSummaryForMediaId(mediaId: string): Promise<MediaUsageSummary> {
  const pool = getPool();
  const mediaUrl = `/api/media/${mediaId}`;

  const res = await pool.query<{
    materials: string;
    exercises: string;
    clinical_tests: string;
    recommendations: string;
    sections: string;
  }>(
    `SELECT
        (SELECT COUNT(DISTINCT cp.id)::text
           FROM content_pages cp
          WHERE cp.image_url = $1
             OR cp.video_url = $1
             OR cp.body_md LIKE '%' || $1 || '%'
             OR cp.body_html LIKE '%' || $1 || '%') AS materials,
        (SELECT COUNT(DISTINCT e.id)::text
           FROM lfk_exercise_media em
           INNER JOIN lfk_exercises e ON e.id = em.exercise_id AND e.is_archived = false
          WHERE em.media_url = $1) AS exercises,
        (SELECT COUNT(*)::text
           FROM tests t
          WHERE t.is_archived = false
            AND EXISTS (
              SELECT 1
                FROM jsonb_array_elements(t.media) elem
               WHERE elem->>'mediaUrl' = $1
            )) AS clinical_tests,
        (SELECT COUNT(*)::text
           FROM recommendations r
          WHERE r.is_archived = false
            AND EXISTS (
              SELECT 1
                FROM jsonb_array_elements(r.media) elem
               WHERE elem->>'mediaUrl' = $1
            )) AS recommendations,
        (SELECT COUNT(*)::text
           FROM content_sections cs
          WHERE cs.cover_image_url = $1
             OR cs.icon_image_url = $1) AS sections`,
    [mediaUrl],
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

export function formatMediaUsageSummaryLines(summary: MediaUsageSummary): string[] {
  const lines: string[] = [];
  if (summary.materials > 0) lines.push(`Материалы: ${summary.materials}`);
  if (summary.exercises > 0) lines.push(`Упражнения: ${summary.exercises}`);
  if (summary.clinicalTests > 0) lines.push(`Тесты: ${summary.clinicalTests}`);
  if (summary.recommendations > 0) lines.push(`Рекомендации: ${summary.recommendations}`);
  if (summary.sections > 0) lines.push(`Разделы контента: ${summary.sections}`);
  return lines;
}
