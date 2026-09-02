/** Catalog media preview lookup. */
import { and, asc, eq, inArray, isNull, ne, or } from 'drizzle-orm';
import { getDrizzle } from '@/app-layer/db/drizzle';
import {
  catalogMediaLadderLookup,
  type CatalogMediaLadder,
} from '@/infra/repos/catalogMediaLadderLookup';
import { clinicalTests } from '../../../db/schema/clinicalTests';
import { recommendations } from '../../../db/schema/recommendations';
import { contentPages, lfkExerciseMedia, lfkExercises } from '../../../db/schema/schema';
import type { MediaPreviewStatus } from '@/modules/media/types';
import type { TreatmentProgramItemSnapshotPort } from '@/modules/treatment-program/ports';
import type { TreatmentProgramItemType } from '@/modules/treatment-program/types';
import { getCurrentDbPrincipalOrganizationId } from '@bersoncare/db-principal';
import { createPgOrgEntitlementsPort } from '@/infra/repos/pgOrgEntitlements';
import { isMechanicEnabled } from '@/modules/org-entitlements/service';
import {
  LESSON_CONTENT_SECTION,
  LESSON_CONTENT_SECTION_LEGACY,
} from '@/modules/treatment-program/types';
import { parseHostedVideoLink } from '@/shared/lib/hostingEmbedUrls';

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
    const mediaType =
      mt === 'image' || mt === 'video' || mt === 'gif' || mt === 'hosted_video' ? mt : 'image';
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

/** Hosted links retained inside an immutable program-item snapshot. */
export function hostedVideoUrlsInProgramSnapshot(snapshot: Record<string, unknown>): string[] {
  if (!Array.isArray(snapshot.media)) return [];
  const urls = new Set<string>();
  for (const raw of snapshot.media) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const row = raw as Record<string, unknown>;
    const mediaType = row.mediaType ?? row.type;
    if (mediaType !== 'hosted_video') continue;
    const rawUrl = typeof row.mediaUrl === 'string' ? row.mediaUrl : row.url;
    if (typeof rawUrl !== 'string') continue;
    const parsed = parseHostedVideoLink(rawUrl);
    if (parsed) urls.add(parsed.canonicalUrl);
  }
  return [...urls];
}

/**
 * Preview status is operational state, not immutable clinical content. Refresh it from the common
 * ladder whenever an instance is read, so an assignment created while the cover was still pending
 * starts showing our image after the worker finishes without rewriting the clinical snapshot.
 */
export function withCurrentHostedVideoPreviewsInProgramSnapshot(
  snapshot: Record<string, unknown>,
  ladder: CatalogMediaLadder,
): Record<string, unknown> {
  if (!Array.isArray(snapshot.media)) return snapshot;
  let changed = false;
  const media = snapshot.media.map((raw) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw;
    const row = raw as Record<string, unknown>;
    const mediaType = row.mediaType ?? row.type;
    if (mediaType !== 'hosted_video') return raw;
    const rawUrl = typeof row.mediaUrl === 'string' ? row.mediaUrl : row.url;
    if (typeof rawUrl !== 'string') return raw;
    const parsed = parseHostedVideoLink(rawUrl);
    if (!parsed) return raw;
    const current = ladder.get(parsed.canonicalUrl);
    changed = true;
    return {
      ...row,
      previewSmUrl: current?.previewSmUrl ?? null,
      previewMdUrl: current?.previewMdUrl ?? null,
      previewStatus: current?.previewStatus ?? 'skipped',
      standardRendition: current?.standardRendition ?? false,
    };
  });
  return changed ? { ...snapshot, media } : snapshot;
}

/**
 * Дополняет каталожные медиа состоянием лестницы (`catalogMediaLadderLookup`) — для снимков
 * элементов программы (пациентский UI без join к БД на клиенте). Один батч-запрос на весь снимок,
 * не на картинку. Дверь сама различает наш файл (`/api/media/{uuid}`) и ссылку на видеохостинг,
 * поэтому здесь id больше не разбирается.
 */
async function catalogMediaRowsWithWorkerPreviews(
  rows: CatalogMediaRowInput[],
): Promise<CatalogMediaSnapshotRow[]> {
  if (rows.length === 0) return [];
  const ladderByUrl = await catalogMediaLadderLookup(rows.map((r) => r.mediaUrl));
  return rows.map((row) => {
    const ladder = ladderByUrl.get(row.mediaUrl);
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
