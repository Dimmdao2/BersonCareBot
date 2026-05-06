import { and, asc, eq, inArray, isNull, ne, or } from "drizzle-orm";
import { getDrizzle } from "@/app-layer/db/drizzle";
import { getPool } from "@/infra/db/client";
import { clinicalTests, testSetItems, testSets } from "../../../db/schema/clinicalTests";
import { recommendations } from "../../../db/schema/recommendations";
import {
  contentPages,
  lfkComplexTemplateExercises,
  lfkComplexTemplates,
  lfkExerciseMedia,
  lfkExercises,
} from "../../../db/schema/schema";
import type { MediaPreviewStatus } from "@/modules/media/types";
import type { TreatmentProgramItemSnapshotPort } from "@/modules/treatment-program/ports";
import type { TreatmentProgramItemType } from "@/modules/treatment-program/types";
import { mediaPreviewUrlById, parseMediaFileIdFromAppUrl } from "@/shared/lib/mediaPreviewUrls";
import {
  LESSON_CONTENT_SECTION,
  LESSON_CONTENT_SECTION_LEGACY,
} from "@/modules/treatment-program/types";

function notFound(type: TreatmentProgramItemType): Error {
  return new Error(`Снимок: объект типа «${type}» не найден`);
}

const BODY_PREVIEW_LEN = 600;

type CatalogMediaRowInput = { mediaUrl: string; mediaType: string; sortOrder: number };

type CatalogMediaSnapshotRow = CatalogMediaRowInput & {
  previewSmUrl: string | null;
  previewMdUrl: string | null;
  previewStatus: MediaPreviewStatus;
};

/**
 * Дополняет каталожные медиа (`/api/media/{uuid}`) полями превью воркера из `media_files` — для снимков
 * элементов программы (пациентский UI без join к БД на клиенте).
 */
async function catalogMediaRowsWithWorkerPreviews(
  pool: ReturnType<typeof getPool>,
  rows: CatalogMediaRowInput[],
): Promise<CatalogMediaSnapshotRow[]> {
  if (rows.length === 0) return [];
  const fileIds = [
    ...new Set(rows.map((r) => parseMediaFileIdFromAppUrl(r.mediaUrl)).filter(Boolean)),
  ] as string[];
  const byId = new Map<
    string,
    { preview_sm_key: string | null; preview_md_key: string | null; preview_status: string | null }
  >();
  if (fileIds.length > 0) {
    const r = await pool.query<{
      id: string;
      preview_sm_key: string | null;
      preview_md_key: string | null;
      preview_status: string | null;
    }>(
      `SELECT id::text AS id, preview_sm_key, preview_md_key, preview_status
       FROM media_files
       WHERE id = ANY($1::uuid[])`,
      [fileIds],
    );
    for (const row of r.rows) {
      byId.set(String(row.id).toLowerCase(), row);
    }
  }
  return rows.map((row) => {
    const mid = parseMediaFileIdFromAppUrl(row.mediaUrl);
    const mf = mid ? byId.get(mid) : undefined;
    const previewSmUrl =
      mid && mf?.preview_sm_key?.trim() ? mediaPreviewUrlById(mid, "sm") : null;
    const previewMdUrl =
      mid && mf?.preview_md_key?.trim() ? mediaPreviewUrlById(mid, "md") : null;
    const previewStatus = (mf?.preview_status ?? "pending") as MediaPreviewStatus;
    return {
      ...row,
      previewSmUrl,
      previewMdUrl,
      previewStatus,
    };
  });
}

export function createPgTreatmentProgramItemSnapshotPort(): TreatmentProgramItemSnapshotPort {
  return {
    async buildSnapshot(type: TreatmentProgramItemType, itemRefId: string): Promise<Record<string, unknown>> {
      const db = getDrizzle();
      switch (type) {
        case "exercise": {
          const row = await db.query.lfkExercises.findFirst({
            where: and(eq(lfkExercises.id, itemRefId), eq(lfkExercises.isArchived, false)),
          });
          if (!row) throw notFound(type);
          const mediaRows = await db
            .select()
            .from(lfkExerciseMedia)
            .where(eq(lfkExerciseMedia.exerciseId, itemRefId))
            .orderBy(asc(lfkExerciseMedia.sortOrder), asc(lfkExerciseMedia.id));
          const pool = getPool();
          const base = mediaRows.map((m) => ({
            mediaUrl: m.mediaUrl,
            mediaType: m.mediaType,
            sortOrder: m.sortOrder,
          }));
          const enriched = await catalogMediaRowsWithWorkerPreviews(pool, base);
          return {
            itemType: type,
            id: row.id,
            title: row.title,
            description: row.description ?? null,
            difficulty: row.difficulty110 ?? null,
            loadType: row.loadType ?? null,
            media: enriched.map((m) => ({
              url: m.mediaUrl,
              type: m.mediaType,
              sortOrder: m.sortOrder,
              previewSmUrl: m.previewSmUrl,
              previewMdUrl: m.previewMdUrl,
              previewStatus: m.previewStatus,
            })),
          };
        }
        case "lfk_complex": {
          const tpl = await db.query.lfkComplexTemplates.findFirst({
            where: and(eq(lfkComplexTemplates.id, itemRefId), ne(lfkComplexTemplates.status, "archived")),
          });
          if (!tpl) throw notFound(type);
          const lines = await db
            .select()
            .from(lfkComplexTemplateExercises)
            .where(eq(lfkComplexTemplateExercises.templateId, itemRefId))
            .orderBy(asc(lfkComplexTemplateExercises.sortOrder), asc(lfkComplexTemplateExercises.id));
          const exIds = [...new Set(lines.map((l) => l.exerciseId))];
          const exRows =
            exIds.length === 0
              ? []
              : await db
                  .select()
                  .from(lfkExercises)
                  .where(inArray(lfkExercises.id, exIds));
          const exTitle = new Map(exRows.map((e) => [e.id, e.title]));
          return {
            itemType: type,
            id: tpl.id,
            title: tpl.title,
            description: tpl.description ?? null,
            exercises: lines.map((l) => ({
              exerciseId: l.exerciseId,
              title: exTitle.get(l.exerciseId) ?? null,
              sortOrder: l.sortOrder,
              reps: l.reps ?? null,
              sets: l.sets ?? null,
              side: l.side ?? null,
              comment: l.comment ?? null,
            })),
          };
        }
        case "test_set": {
          const setRow = await db.query.testSets.findFirst({
            where: and(eq(testSets.id, itemRefId), eq(testSets.isArchived, false)),
          });
          if (!setRow) throw notFound(type);
          const items = await db
            .select()
            .from(testSetItems)
            .where(eq(testSetItems.testSetId, itemRefId))
            .orderBy(asc(testSetItems.sortOrder), asc(testSetItems.id));
          const testIds = items.map((i) => i.testId);
          const testsRows =
            testIds.length === 0
              ? []
              : await db
                  .select()
                  .from(clinicalTests)
                  .where(inArray(clinicalTests.id, testIds));
          const byId = new Map(testsRows.map((t) => [t.id, t]));
          return {
            itemType: type,
            id: setRow.id,
            title: setRow.title,
            description: setRow.description ?? null,
            tests: items.map((it) => {
              const t = byId.get(it.testId);
              return {
                testId: it.testId,
                title: t?.title ?? null,
                scoringConfig: (t?.scoring ?? null) as unknown,
                sortOrder: it.sortOrder,
                comment: it.comment ?? null,
              };
            }),
          };
        }
        case "recommendation": {
          const row = await db.query.recommendations.findFirst({
            where: and(eq(recommendations.id, itemRefId), eq(recommendations.isArchived, false)),
          });
          if (!row) throw notFound(type);
          const rawMedia = (row.media ?? []) as CatalogMediaRowInput[];
          const pool = getPool();
          const enriched = await catalogMediaRowsWithWorkerPreviews(pool, rawMedia);
          return {
            itemType: type,
            id: row.id,
            title: row.title,
            bodyMd: row.bodyMd ?? "",
            media: enriched.map((m) => ({
              mediaUrl: m.mediaUrl,
              mediaType: m.mediaType,
              sortOrder: m.sortOrder,
              previewSmUrl: m.previewSmUrl,
              previewMdUrl: m.previewMdUrl,
              previewStatus: m.previewStatus,
            })),
          };
        }
        case "lesson": {
          const row = await db.query.contentPages.findFirst({
            where: and(
              eq(contentPages.id, itemRefId),
              or(
                eq(contentPages.section, LESSON_CONTENT_SECTION),
                eq(contentPages.section, LESSON_CONTENT_SECTION_LEGACY),
              ),
              isNull(contentPages.deletedAt),
            ),
          });
          if (!row) throw notFound(type);
          const md = row.bodyMd ?? "";
          return {
            itemType: type,
            id: row.id,
            title: row.title,
            summary: row.summary ?? "",
            bodyPreview: md.length > BODY_PREVIEW_LEN ? `${md.slice(0, BODY_PREVIEW_LEN)}…` : md,
          };
        }
        default: {
          const _x: never = type;
          throw new Error(`Снимок: неизвестный тип ${String(_x)}`);
        }
      }
    },
  };
}
