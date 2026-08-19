/** Wave 3 phase 15C — catalog media preview lookup via `runWebappPgText`. */
import { and, asc, eq, inArray, isNull, ne, or } from 'drizzle-orm';
import { getDrizzle } from '@/app-layer/db/drizzle';
import { catalogMediaLadderLookup } from '@/infra/repos/catalogMediaLadderLookup';
import { clinicalTests } from '../../../db/schema/clinicalTests';
import { recommendations } from '../../../db/schema/recommendations';
import { contentPages, lfkExerciseMedia, lfkExercises } from '../../../db/schema/schema';
import type { MediaPreviewStatus } from '@/modules/media/types';
import type { TreatmentProgramItemSnapshotPort } from '@/modules/treatment-program/ports';
import type { TreatmentProgramItemType } from '@/modules/treatment-program/types';
import { parseMediaFileIdFromAppUrl } from '@/shared/lib/mediaPreviewUrls';
import { getCurrentDbPrincipalOrganizationId } from '@bersoncare/db-principal';
import { createPgOrgEntitlementsPort } from '@/infra/repos/pgOrgEntitlements';
import { isMechanicEnabled } from '@/modules/org-entitlements/service';
import {
  LESSON_CONTENT_SECTION,
  LESSON_CONTENT_SECTION_LEGACY,
} from '@/modules/treatment-program/types';

function notFound(type: TreatmentProgramItemType): Error {
  return new Error(`Снимок: объект типа «${type}» не найден`);
}

const BODY_PREVIEW_LEN = 600;
const snapshotEntitlements = createPgOrgEntitlementsPort();

type CatalogMediaRowInput = { mediaUrl: string; mediaType: string; sortOrder: number };

function clinicalTestMediaToCatalogRows(raw: unknown): CatalogMediaRowInput[] {
  if (!Array.isArray(raw)) return [];
  const out: CatalogMediaRowInput[] = [];
  for (const m of raw) {
    if (!m || typeof m !== 'object') continue;
    const mediaUrl =
      typeof (m as { mediaUrl?: unknown }).mediaUrl === 'string'
        ? (m as { mediaUrl: string }).mediaUrl.trim()
        : '';
    if (!mediaUrl) continue;
    const mt = (m as { mediaType?: unknown }).mediaType;
    const mediaType = mt === 'image' || mt === 'video' || mt === 'gif' ? mt : 'image';
    const sortOrder =
      typeof (m as { sortOrder?: unknown }).sortOrder === 'number' &&
      Number.isFinite((m as { sortOrder: number }).sortOrder)
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
  standardRendition: boolean;
};

/**
 * Дополняет каталожные медиа (`/api/media/{uuid}`) состоянием лестницы (`catalogMediaLadderLookup`) —
 * для снимков элементов программы (пациентский UI без join к БД на клиенте). Один батч-запрос на
 * весь снимок, не на картинку.
 */
async function catalogMediaRowsWithWorkerPreviews(
  rows: CatalogMediaRowInput[],
): Promise<CatalogMediaSnapshotRow[]> {
  if (rows.length === 0) return [];
  const fileIds = rows
    .map((r) => parseMediaFileIdFromAppUrl(r.mediaUrl))
    .filter((id): id is string => Boolean(id));
  const byId = await catalogMediaLadderLookup(fileIds);
  return rows.map((row) => {
    const mid = parseMediaFileIdFromAppUrl(row.mediaUrl);
    const ladder = mid ? byId.get(mid) : undefined;
    return {
      ...row,
      previewSmUrl: ladder?.previewSmUrl ?? null,
      previewMdUrl: ladder?.previewMdUrl ?? null,
      previewStatus: ladder?.previewStatus ?? 'pending',
      standardRendition: ladder?.standardRendition ?? false,
    };
  });
}

export function createPgTreatmentProgramItemSnapshotPort(): TreatmentProgramItemSnapshotPort {
  return {
    async buildSnapshot(
      type: TreatmentProgramItemType,
      itemRefId: string,
    ): Promise<Record<string, unknown>> {
      const db = getDrizzle();
      switch (type) {
        case 'exercise': {
          const organizationId = getCurrentDbPrincipalOrganizationId();
          if (!organizationId) throw notFound(type);
          const includePlatformBase = await isMechanicEnabled(
            snapshotEntitlements,
            organizationId,
            'exercise_catalog',
          );
          const row = await db.query.lfkExercises.findFirst({
            where: and(
              eq(lfkExercises.id, itemRefId),
              eq(lfkExercises.isArchived, false),
              eq(lfkExercises.catalogScope, 'catalog'),
              or(
                and(
                  eq(lfkExercises.ownerKind, 'organization'),
                  eq(lfkExercises.organizationId, organizationId),
                ),
                includePlatformBase
                  ? and(eq(lfkExercises.ownerKind, 'platform'), isNull(lfkExercises.organizationId))
                  : undefined,
              ),
            ),
          });
          if (!row) throw notFound(type);
          const mediaRows = await db
            .select()
            .from(lfkExerciseMedia)
            .where(
              and(
                eq(lfkExerciseMedia.exerciseId, itemRefId),
                eq(lfkExerciseMedia.ownerKind, row.ownerKind),
                row.ownerKind === 'platform'
                  ? isNull(lfkExerciseMedia.organizationId)
                  : eq(lfkExerciseMedia.organizationId, organizationId),
              ),
            )
            .orderBy(asc(lfkExerciseMedia.sortOrder), asc(lfkExerciseMedia.id));
          const base = mediaRows.map((m) => ({
            mediaUrl: m.mediaUrl,
            mediaType: m.mediaType,
            sortOrder: m.sortOrder,
          }));
          const enriched = await catalogMediaRowsWithWorkerPreviews(base);
          const media =
            enriched.length > 0
              ? enriched.map((m) => ({
                  url: m.mediaUrl,
                  type: m.mediaType,
                  sortOrder: m.sortOrder,
                  previewSmUrl: m.previewSmUrl,
                  previewMdUrl: m.previewMdUrl,
                  previewStatus: m.previewStatus,
                  standardRendition: m.standardRendition,
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
        case 'clinical_test': {
          const t = await db.query.clinicalTests.findFirst({
            where: and(eq(clinicalTests.id, itemRefId), eq(clinicalTests.isArchived, false)),
          });
          if (!t) throw notFound(type);
          const rawMedia = clinicalTestMediaToCatalogRows(t.media);
          const enriched =
            rawMedia.length === 0 ? [] : await catalogMediaRowsWithWorkerPreviews(rawMedia);
          const media =
            enriched.length > 0
              ? enriched.map((m) => ({
                  mediaUrl: m.mediaUrl,
                  mediaType: m.mediaType,
                  sortOrder: m.sortOrder,
                  previewSmUrl: m.previewSmUrl,
                  previewMdUrl: m.previewMdUrl,
                  previewStatus: m.previewStatus,
                  standardRendition: m.standardRendition,
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
        case 'recommendation': {
          const row = await db.query.recommendations.findFirst({
            where: and(eq(recommendations.id, itemRefId), eq(recommendations.isArchived, false)),
          });
          if (!row) throw notFound(type);
          const rawMedia = (row.media ?? []) as CatalogMediaRowInput[];
          const enriched = await catalogMediaRowsWithWorkerPreviews(rawMedia);
          const media =
            enriched.length > 0
              ? enriched.map((m) => ({
                  mediaUrl: m.mediaUrl,
                  mediaType: m.mediaType,
                  sortOrder: m.sortOrder,
                  previewSmUrl: m.previewSmUrl,
                  previewMdUrl: m.previewMdUrl,
                  previewStatus: m.previewStatus,
                  standardRendition: m.standardRendition,
                }))
              : null;
          return {
            itemType: type,
            id: row.id,
            title: row.title,
            bodyMd: row.bodyMd ?? '',
            ...(media ? { media } : {}),
          };
        }
        case 'lesson': {
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
          const md = row.bodyMd ?? '';
          return {
            itemType: type,
            id: row.id,
            title: row.title,
            summary: row.summary ?? '',
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
