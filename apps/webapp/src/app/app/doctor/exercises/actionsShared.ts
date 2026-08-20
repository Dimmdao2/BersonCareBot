import { requireDoctorWorkspaceContext } from '@/app-layer/guards/requireRole';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { withDoctorWorkspacePrincipal } from '@/app-layer/principal/withOrganizationPrincipal';
import { webappReposAreInMemory } from '@/config/env';
import { logger } from '@/infra/logging/logger';
import {
  isExerciseArchiveAlreadyArchivedError,
  isExerciseArchiveNotFoundError,
  isExerciseUnarchiveNotArchivedError,
  isUsageConfirmationRequiredError,
} from '@/modules/lfk-exercises/errors';
import type { MediaExerciseUsageEntry } from '@/modules/media/types';
import type { ExerciseMediaType, ExerciseUsageSnapshot } from '@/modules/lfk-exercises/types';
import {
  EXERCISE_LOAD_TYPE_CATEGORY_CODE,
  exerciseLoadTypeWriteAllowSet,
  parseExerciseLoadFormValue,
} from '@/modules/lfk-exercises/exerciseLoadTypeReference';
import { parseMediaFileIdFromAppUrl } from '@/shared/lib/mediaPreviewUrls';
import { API_MEDIA_URL_RE } from '@/shared/lib/mediaUrlPolicy';
import {
  hostedVideoLinkRejectionRu,
  parseHostedVideoLink,
} from '@/shared/lib/hostingEmbedUrls';
import { z } from 'zod';

import { EXERCISES_PATH } from './exercisesPaths';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseRegionRefIdsFromFormData(fd: FormData, fieldName: string): string[] {
  const raw = fd.getAll(fieldName);
  const out: string[] = [];
  for (const x of raw) {
    if (typeof x !== 'string') continue;
    const t = x.trim();
    if (UUID_RE.test(t)) out.push(t);
  }
  return [...new Set(out)];
}

export type SaveDoctorExerciseState = { ok: boolean; error?: string };

export type ArchiveDoctorExerciseState =
  | { ok: true }
  | { ok: false; code: 'USAGE_CONFIRMATION_REQUIRED'; usage: ExerciseUsageSnapshot }
  | { ok: false; error: string };

export type ArchiveDoctorExerciseCoreResult =
  | { kind: 'archived'; id: string }
  | { kind: 'needs_confirmation'; usage: ExerciseUsageSnapshot }
  | { kind: 'invalid'; error: string };

export type UnarchiveDoctorExerciseCoreResult =
  | { kind: 'unarchived'; id: string }
  | { kind: 'invalid'; error: string };

export type UnarchiveDoctorExerciseState = { ok: true } | { ok: false; error: string };

function parseAcknowledgeUsageWarning(fd: FormData): boolean {
  const v = fd.get('acknowledgeUsageWarning');
  return v === '1' || v === 'true' || v === 'on';
}

export { EXERCISES_PATH };

type SaveExerciseResult =
  | { ok: true; exerciseId: string; wasUpdate: boolean }
  | { ok: false; error: string };

function parseTags(raw: FormDataEntryValue | null): string[] | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const parts = raw
    .split(/[,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length ? parts : null;
}

/**
 * Приводит медиа упражнения к тому, что можно записать, либо отказывает с причиной.
 *
 * Два разных вида, и проверяются они по-разному: `image|video|gif` — файл нашей медиатеки,
 * `hosted_video` — ссылка на внешний хостинг, которая ещё и канонизируется здесь (из вставленного
 * URL выбрасываются utm-хвосты, плейлисты и тайм-коды). В базу уходит именно `mediaUrl` из
 * результата, а не то, что прислала форма.
 */
function normalizeExerciseMedia(
  mediaUrl: string | null,
  mediaType: ExerciseMediaType | null,
): { ok: true; mediaUrl: string | null; mediaType: ExerciseMediaType | null } | { ok: false; error: string } {
  if (mediaType && !mediaUrl) {
    return { ok: false, error: 'Некорректные данные медиа: очистите медиа и выберите файл снова.' };
  }
  if (mediaUrl && !mediaType) {
    return { ok: false, error: 'Выберите файл из библиотеки — не указан тип медиа.' };
  }
  if (!mediaUrl || !mediaType) return { ok: true, mediaUrl: null, mediaType: null };

  if (mediaType === 'hosted_video') {
    const link = parseHostedVideoLink(mediaUrl);
    if (!link) {
      return { ok: false, error: hostedVideoLinkRejectionRu(mediaUrl) ?? 'Ссылка не принята.' };
    }
    return { ok: true, mediaUrl: link.canonicalUrl, mediaType };
  }

  if (!API_MEDIA_URL_RE.test(mediaUrl)) {
    return {
      ok: false,
      error: 'Выберите файл из библиотеки медиа.',
    };
  }
  return { ok: true, mediaUrl, mediaType };
}

async function exerciseVideoDurationRejection(
  deps: ReturnType<typeof buildAppDeps>,
  mediaUrl: string | null,
  mediaType: ExerciseMediaType | null,
): Promise<string | null> {
  if (mediaType !== 'video' || !mediaUrl) return null;
  const mediaId = parseMediaFileIdFromAppUrl(mediaUrl);
  if (!mediaId) return null;
  const result = await deps.media.getVideoAttachmentDurationRejection(mediaId, 'exercise');
  return result.ok ? null : result.error;
}

export const bulkCreateExerciseMediaItemSchema = z.object({
  title: z.string().min(1).max(500),
  mediaUrl: z.string().min(1).max(500),
  mediaType: z.enum(['image', 'video', 'gif']),
});

export const bulkCreateExercisesFromMediaInputSchema = z
  .array(bulkCreateExerciseMediaItemSchema)
  .min(1)
  .max(100);

export type BulkCreateExercisesFromMediaItem = z.infer<typeof bulkCreateExerciseMediaItemSchema>;

export type BulkCreateExercisesFromMediaResult =
  | {
      ok: true;
      created: number;
      skippedLinked: number;
      failed: number;
      createdIds: string[];
    }
  | { ok: false; error: string };

/**
 * Creates one exercise per library media row. Skips items already linked to a non-archived exercise (re-checked on server).
 */
export async function bulkCreateExercisesFromMediaCore(
  items: BulkCreateExercisesFromMediaItem[],
): Promise<BulkCreateExercisesFromMediaResult> {
  const workspace = await requireDoctorWorkspaceContext();
  const userId = workspace.session.user.userId;

  const deduped: BulkCreateExercisesFromMediaItem[] = [];
  const seenUrl = new Set<string>();
  for (const raw of items) {
    const key = raw.mediaUrl.trim().toLowerCase();
    if (seenUrl.has(key)) continue;
    seenUrl.add(key);
    deduped.push({
      title: raw.title.trim(),
      mediaUrl: raw.mediaUrl.trim(),
      mediaType: raw.mediaType,
    });
  }

  logger.info(
    {
      event: 'lfk_exercises_bulk_auto_create_start',
      userId,
      requestedCount: items.length,
      dedupedCount: deduped.length,
    },
    'lfk_exercises_bulk_auto_create_start',
  );

  const deps = buildAppDeps();
  const mediaIds = deduped
    .map((i) => parseMediaFileIdFromAppUrl(i.mediaUrl))
    .filter((id): id is string => Boolean(id));

  let usageByMediaId: Record<string, MediaExerciseUsageEntry[]> = {};
  const linkedUrlsInMemory = new Set<string>();

  if (webappReposAreInMemory()) {
    const all = await deps.lfkExercises.listExercises({ includeArchived: false });
    for (const ex of all) {
      for (const m of ex.media) {
        linkedUrlsInMemory.add(m.mediaUrl.trim().toLowerCase());
      }
    }
  } else if (mediaIds.length > 0) {
    usageByMediaId = await deps.lfkExerciseMediaUsage.listForMediaIds(mediaIds);
  }

  let created = 0;
  let skippedLinked = 0;
  let failed = 0;
  const createdIds: string[] = [];

  for (const row of deduped) {
    const title = row.title.trim();
    if (!title) {
      failed += 1;
      continue;
    }
    const normalizedBulk = normalizeExerciseMedia(row.mediaUrl, row.mediaType);
    const mediaErr = normalizedBulk.ok ? null : normalizedBulk.error;
    if (mediaErr) {
      failed += 1;
      continue;
    }
    const durationError = await exerciseVideoDurationRejection(
      deps,
      normalizedBulk.mediaUrl,
      normalizedBulk.mediaType,
    );
    if (durationError) {
      failed += 1;
      continue;
    }
    const mediaId = parseMediaFileIdFromAppUrl(row.mediaUrl);
    if (!mediaId) {
      failed += 1;
      continue;
    }

    if (webappReposAreInMemory()) {
      if (linkedUrlsInMemory.has(row.mediaUrl.trim().toLowerCase())) {
        skippedLinked += 1;
        continue;
      }
    } else {
      const usage = usageByMediaId[mediaId] ?? [];
      if (usage.length > 0) {
        skippedLinked += 1;
        continue;
      }
    }

    try {
      const ex = await deps.lfkExercises.createExercise(
        {
          title,
          media: [{ mediaUrl: row.mediaUrl, mediaType: row.mediaType, sortOrder: 0 }],
        },
        userId,
        {
          runExerciseWrite: (fn) =>
            withDoctorWorkspacePrincipal(workspace, 'doctor.lfk-exercises.bulk-create', fn),
        },
      );
      created += 1;
      createdIds.push(ex.id);
      if (webappReposAreInMemory()) {
        linkedUrlsInMemory.add(row.mediaUrl.trim().toLowerCase());
      } else {
        usageByMediaId[mediaId] = [{ exerciseId: ex.id, title }];
      }
    } catch (e) {
      logger.warn(
        { event: 'lfk_exercises_bulk_auto_create_item_failed', userId, mediaId, err: e },
        'lfk_exercises_bulk_auto_create_item_failed',
      );
      failed += 1;
    }
  }

  logger.info(
    {
      event: 'lfk_exercises_bulk_auto_create_finish',
      userId,
      created,
      skippedLinked,
      failed,
      createdIds,
    },
    'lfk_exercises_bulk_auto_create_finish',
  );

  return { ok: true, created, skippedLinked, failed, createdIds };
}

export async function saveDoctorExerciseCore(formData: FormData): Promise<SaveExerciseResult> {
  const workspace = await requireDoctorWorkspaceContext();
  const deps = buildAppDeps();
  const loadRefItems = await deps.references.listActiveItemsByCategoryCode(
    EXERCISE_LOAD_TYPE_CATEGORY_CODE,
  );
  const loadAllow = exerciseLoadTypeWriteAllowSet(loadRefItems);
  const allowRegions = new Set(
    (await deps.references.listActiveItemsByCategoryCode('body_region')).map((i) => i.id),
  );
  const regionRefIds = parseRegionRefIdsFromFormData(formData, 'regionRefIds').filter((id) =>
    allowRegions.has(id),
  );

  const idRaw = formData.get('id');
  const id = typeof idRaw === 'string' && idRaw.trim() ? idRaw.trim() : null;

  const title = (formData.get('title') as string)?.trim() ?? '';
  if (!title) {
    return { ok: false, error: 'Укажите название' };
  }

  const description = (formData.get('description') as string)?.trim() || null;
  const loadType = parseExerciseLoadFormValue(formData.get('loadType'), loadAllow);
  const diffRaw = formData.get('difficulty1_10');
  let difficulty1_10: number | null = null;
  if (typeof diffRaw === 'string' && diffRaw.trim()) {
    const n = Number.parseInt(diffRaw, 10);
    if (!Number.isNaN(n) && n >= 1 && n <= 10) difficulty1_10 = n;
  }
  const contraindications = (formData.get('contraindications') as string)?.trim() || null;
  const tags = parseTags(formData.get('tags'));

  const mediaUrlRaw = (formData.get('mediaUrl') as string)?.trim() || '';
  const mediaTypeRaw = formData.get('mediaType');
  const mediaTypeParsed: ExerciseMediaType | null =
    mediaTypeRaw === 'image' ||
    mediaTypeRaw === 'video' ||
    mediaTypeRaw === 'gif' ||
    mediaTypeRaw === 'hosted_video'
      ? mediaTypeRaw
      : null;

  const normalized = normalizeExerciseMedia(mediaUrlRaw.length ? mediaUrlRaw : null, mediaTypeParsed);
  if (!normalized.ok) {
    return { ok: false, error: normalized.error };
  }
  const mediaUrl = normalized.mediaUrl;
  const mediaType = normalized.mediaType;
  const durationError = await exerciseVideoDurationRejection(deps, mediaUrl, mediaType);
  if (durationError) {
    return { ok: false, error: durationError };
  }

  if (id) {
    const current = await deps.lfkExercises.getExercise(id);
    if (!current) {
      return { ok: false, error: 'Упражнение не найдено' };
    }
    if (current.isArchived) {
      return { ok: false, error: 'Упражнение в архиве. Верните из архива, чтобы редактировать.' };
    }
    await deps.lfkExercises.updateExercise(
      id,
      {
        title,
        description,
        regionRefIds,
        loadType,
        difficulty1_10,
        contraindications,
        tags,
        media: mediaUrl && mediaType ? [{ mediaUrl, mediaType, sortOrder: 0 }] : [],
      },
      {
        runExerciseWrite: (fn) =>
          withDoctorWorkspacePrincipal(workspace, 'doctor.lfk-exercises.update', fn),
      },
    );
    return { ok: true, exerciseId: id, wasUpdate: true };
  }

  const created = await deps.lfkExercises.createExercise(
    {
      title,
      description,
      regionRefIds,
      loadType,
      difficulty1_10,
      contraindications,
      tags,
      media: mediaUrl && mediaType ? [{ mediaUrl, mediaType, sortOrder: 0 }] : undefined,
    },
    workspace.session.user.userId,
    {
      runExerciseWrite: (fn) =>
        withDoctorWorkspacePrincipal(workspace, 'doctor.lfk-exercises.create', fn),
    },
  );
  return { ok: true, exerciseId: created.id, wasUpdate: false };
}

export async function archiveDoctorExerciseCore(
  formData: FormData,
): Promise<ArchiveDoctorExerciseCoreResult> {
  const workspace = await requireDoctorWorkspaceContext();
  const idRaw = formData.get('id');
  const id = typeof idRaw === 'string' ? idRaw.trim() : '';
  if (!id) return { kind: 'invalid', error: 'Не указано упражнение' };

  const acknowledgeUsageWarning = parseAcknowledgeUsageWarning(formData);
  const deps = buildAppDeps();
  try {
    await deps.lfkExercises.archiveExercise(
      id,
      { acknowledgeUsageWarning },
      {
        runExerciseWrite: (fn) =>
          withDoctorWorkspacePrincipal(workspace, 'doctor.lfk-exercises.archive', fn),
      },
    );
    return { kind: 'archived', id };
  } catch (e) {
    if (isUsageConfirmationRequiredError(e)) {
      return { kind: 'needs_confirmation', usage: e.usage };
    }
    if (isExerciseArchiveNotFoundError(e)) {
      return { kind: 'invalid', error: e.message };
    }
    if (isExerciseArchiveAlreadyArchivedError(e)) {
      return { kind: 'invalid', error: e.message };
    }
    logger.warn(
      { event: 'doctor_exercise_archive_unexpected_error', exerciseId: id, err: e },
      'archive failed',
    );
    return { kind: 'invalid', error: 'Не удалось архивировать упражнение' };
  }
}

export async function unarchiveDoctorExerciseCore(
  formData: FormData,
): Promise<UnarchiveDoctorExerciseCoreResult> {
  const workspace = await requireDoctorWorkspaceContext();
  const idRaw = formData.get('id');
  const id = typeof idRaw === 'string' ? idRaw.trim() : '';
  if (!id) return { kind: 'invalid', error: 'Не указано упражнение' };

  const deps = buildAppDeps();
  try {
    await deps.lfkExercises.unarchiveExercise(id, {
      runExerciseWrite: (fn) =>
        withDoctorWorkspacePrincipal(workspace, 'doctor.lfk-exercises.unarchive', fn),
    });
    return { kind: 'unarchived', id };
  } catch (e) {
    if (isExerciseArchiveNotFoundError(e)) {
      return { kind: 'invalid', error: e.message };
    }
    if (isExerciseUnarchiveNotArchivedError(e)) {
      return { kind: 'invalid', error: e.message };
    }
    logger.warn(
      { event: 'doctor_exercise_unarchive_unexpected_error', exerciseId: id, err: e },
      'unarchive failed',
    );
    return { kind: 'invalid', error: 'Не удалось вернуть упражнение из архива' };
  }
}
