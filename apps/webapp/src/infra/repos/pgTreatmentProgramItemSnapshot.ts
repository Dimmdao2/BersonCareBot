import { and, asc, eq, inArray, isNull, ne, or } from "drizzle-orm";
import { getDrizzle } from "@/app-layer/db/drizzle";
import { getPool } from "@/infra/db/client";
import { clinicalTests } from "../../../db/schema/clinicalTests";
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

function clinicalTestMediaToCatalogRows(raw: unknown): CatalogMediaRowInput[] {
  if (!Array.isArray(raw)) return [];
  const out: CatalogMediaRowInput[] = [];
  for (const m of raw) {
    if (!m || typeof m !== "object") continue;
    const mediaUrl = typeof (m as { mediaUrl?: unknown }).mediaUrl === "string" ? (m as { mediaUrl: string }).mediaUrl.trim() : "";
    if (!mediaUrl) continue;
    const mt = (m as { mediaType?: unknown }).mediaType;
    const mediaType = mt === "image" || mt === "video" || mt === "gif" ? mt : "image";
    const sortOrder =
      typeof (m as { sortOrder?: unknown }).sortOrder === "number" && Number.isFinite((m as { sortOrder: number }).sortOrder)
        ? (m as { sortOrder: number }).sortOrder
        : out.length;
    out.push({ mediaUrl, mediaType, sortOrder });
  }
  return out;
}

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
          const media =
            enriched.length > 0
              ? enriched.map((m) => ({
                  url: m.mediaUrl,
                  type: m.mediaType,
                  sortOrder: m.sortOrder,
                  previewSmUrl: m.previewSmUrl,
                  previewMdUrl: m.previewMdUrl,
                  previewStatus: m.previewStatus,
                }))
              : null;
          return {
            itemType: type,
            id: row.id,
            title: row.title,
            description: row.description ?? null,
            contraindications: row.contraindications ?? null,
            difficulty: row.difficulty110 ?? null,
            loadType: row.loadType ?? null,
            ...(media ? { media } : {}),
          };
        }
        case "lfk_complex": {
          /** `exercises[].media` — как у `case "exercise"` (превью в модалке состава без клиентских join). */
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
          const pool = getPool();
          const mediaByExerciseId = new Map<string, CatalogMediaSnapshotRow[]>();
          if (exIds.length > 0) {
            const mediaRows = await db
              .select()
              .from(lfkExerciseMedia)
              .where(inArray(lfkExerciseMedia.exerciseId, exIds))
              .orderBy(asc(lfkExerciseMedia.exerciseId), asc(lfkExerciseMedia.sortOrder), asc(lfkExerciseMedia.id));
            const baseInputs: CatalogMediaRowInput[] = mediaRows.map((m) => ({
              mediaUrl: m.mediaUrl,
              mediaType: m.mediaType,
              sortOrder: m.sortOrder,
            }));
            const enriched = await catalogMediaRowsWithWorkerPreviews(pool, baseInputs);
            for (let i = 0; i < mediaRows.length; i++) {
              const mrow = mediaRows[i]!;
              const erow = enriched[i];
              if (!erow) continue;
              const eid = mrow.exerciseId;
              const list = mediaByExerciseId.get(eid) ?? [];
              list.push(erow);
              mediaByExerciseId.set(eid, list);
            }
          }
          const exerciseMediaToSnapshot = (rows: CatalogMediaSnapshotRow[]) =>
            rows.map((m) => ({
              url: m.mediaUrl,
              type: m.mediaType,
              sortOrder: m.sortOrder,
              previewSmUrl: m.previewSmUrl,
              previewMdUrl: m.previewMdUrl,
              previewStatus: m.previewStatus,
            }));
          return {
            itemType: type,
            id: tpl.id,
            title: tpl.title,
            description: tpl.description ?? null,
            exercises: lines.map((l) => {
              const media = exerciseMediaToSnapshot(mediaByExerciseId.get(l.exerciseId) ?? []);
              return {
                exerciseId: l.exerciseId,
                title: exTitle.get(l.exerciseId) ?? null,
                sortOrder: l.sortOrder,
                reps: l.reps ?? null,
                sets: l.sets ?? null,
                side: l.side ?? null,
                comment: l.comment ?? null,
                ...(media.length > 0 ? { media } : {}),
              };
            }),
          };
        }
        case "clinical_test": {
          const t = await db.query.clinicalTests.findFirst({
            where: and(eq(clinicalTests.id, itemRefId), eq(clinicalTests.isArchived, false)),
          });
          if (!t) throw notFound(type);
          const pool = getPool();
          const rawMedia = clinicalTestMediaToCatalogRows(t.media);
          const enriched = rawMedia.length === 0 ? [] : await catalogMediaRowsWithWorkerPreviews(pool, rawMedia);
          const media =
            enriched.length > 0
              ? enriched.map((m) => ({
                  mediaUrl: m.mediaUrl,
                  mediaType: m.mediaType,
                  sortOrder: m.sortOrder,
                  previewSmUrl: m.previewSmUrl,
                  previewMdUrl: m.previewMdUrl,
                  previewStatus: m.previewStatus,
                }))
              : undefined;
          const line: Record<string, unknown> = {
            testId: t.id,
            title: t.title,
            scoringConfig: (t.scoring ?? null) as unknown,
            sortOrder: 0,
            comment: null,
            ...(media ? { media } : {}),
          };
          return {
            itemType: type,
            id: t.id,
            title: t.title,
            tests: [line],
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
          const media =
            enriched.length > 0
              ? enriched.map((m) => ({
                  mediaUrl: m.mediaUrl,
                  mediaType: m.mediaType,
                  sortOrder: m.sortOrder,
                  previewSmUrl: m.previewSmUrl,
                  previewMdUrl: m.previewMdUrl,
                  previewStatus: m.previewStatus,
                }))
              : null;
          return {
            itemType: type,
            id: row.id,
            title: row.title,
            bodyMd: row.bodyMd ?? "",
            ...(media ? { media } : {}),
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
