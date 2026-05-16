import { eq, inArray } from "drizzle-orm";

import { getDrizzle } from "@/app-layer/db/drizzle";
import {
  contentPages,
  lfkComplexTemplateExercises,
  lfkExerciseMedia,
} from "../../../db/schema/schema";
import type { MaterialRatingTargetKind } from "@/modules/material-rating/types";
import { parseMediaFileIdFromAppUrl } from "@/shared/lib/mediaPreviewUrls";

/** UUID из `/api/media/{uuid}` в строке URL (query/hash отрезаются). */
export function extractMediaFileIdFromMaterialUrl(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  const base = raw.trim().split("#")[0]?.split("?")[0] ?? "";
  return parseMediaFileIdFromAppUrl(base);
}

/**
 * Идентификаторы `media_files.id` для видео, связанных с целью оценки (для метрики первых resolve playback).
 */
export async function resolveMaterialRatingTargetVideoMediaIds(
  targetKind: MaterialRatingTargetKind,
  targetId: string,
): Promise<string[]> {
  const db = getDrizzle();
  const ids = new Set<string>();

  if (targetKind === "content_page") {
    const row = await db
      .select({ videoUrl: contentPages.videoUrl })
      .from(contentPages)
      .where(eq(contentPages.id, targetId))
      .limit(1);
    const mid = extractMediaFileIdFromMaterialUrl(row[0]?.videoUrl ?? null);
    if (mid) ids.add(mid);
    return [...ids];
  }

  if (targetKind === "lfk_exercise") {
    const mediaRows = await db
      .select({ mediaUrl: lfkExerciseMedia.mediaUrl, mediaType: lfkExerciseMedia.mediaType })
      .from(lfkExerciseMedia)
      .where(eq(lfkExerciseMedia.exerciseId, targetId));
    for (const m of mediaRows) {
      if (m.mediaType !== "video") continue;
      const mid = extractMediaFileIdFromMaterialUrl(m.mediaUrl);
      if (mid) ids.add(mid);
    }
    return [...ids];
  }

  const exerciseRows = await db
    .select({ exerciseId: lfkComplexTemplateExercises.exerciseId })
    .from(lfkComplexTemplateExercises)
    .where(eq(lfkComplexTemplateExercises.templateId, targetId));
  const exerciseIds = [...new Set(exerciseRows.map((r) => r.exerciseId))];
  if (exerciseIds.length === 0) return [];

  const mediaRows = await db
    .select({ mediaUrl: lfkExerciseMedia.mediaUrl, mediaType: lfkExerciseMedia.mediaType })
    .from(lfkExerciseMedia)
    .where(inArray(lfkExerciseMedia.exerciseId, exerciseIds));
  for (const m of mediaRows) {
    if (m.mediaType !== "video") continue;
    const mid = extractMediaFileIdFromMaterialUrl(m.mediaUrl);
    if (mid) ids.add(mid);
  }
  return [...ids];
}
