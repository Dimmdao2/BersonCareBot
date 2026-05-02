import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { webappReposAreInMemory } from "@/config/env";
import { pgListExerciseUsageForMediaIds } from "@/infra/repos/pgLfkExercises";
import { logger } from "@/infra/logging/logger";
import {
  isExerciseArchiveAlreadyArchivedError,
  isExerciseArchiveNotFoundError,
  isUsageConfirmationRequiredError,
} from "@/modules/lfk-exercises/errors";
import type { MediaExerciseUsageEntry } from "@/modules/media/types";
import type { ExerciseLoadType, ExerciseUsageSnapshot } from "@/modules/lfk-exercises/types";
import { parseMediaFileIdFromAppUrl } from "@/shared/lib/mediaPreviewUrls";
import { API_MEDIA_URL_RE, isLegacyAbsoluteUrl } from "@/shared/lib/mediaUrlPolicy";
import { z } from "zod";

import { EXERCISES_PATH } from "./exercisesPaths";

export type SaveDoctorExerciseState = { ok: boolean; error?: string };

export type ArchiveDoctorExerciseState =
  | { ok: true }
  | { ok: false; code: "USAGE_CONFIRMATION_REQUIRED"; usage: ExerciseUsageSnapshot }
  | { ok: false; error: string };

export type ArchiveDoctorExerciseCoreResult =
  | { kind: "archived"; id: string }
  | { kind: "needs_confirmation"; usage: ExerciseUsageSnapshot }
  | { kind: "invalid"; error: string };

function parseAcknowledgeUsageWarning(fd: FormData): boolean {
  const v = fd.get("acknowledgeUsageWarning");
  return v === "1" || v === "true" || v === "on";
}

export { EXERCISES_PATH };

type SaveExerciseResult =
  | { ok: true; exerciseId: string; wasUpdate: boolean }
  | { ok: false; error: string };

function parseTags(raw: FormDataEntryValue | null): string[] | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const parts = raw
    .split(/[,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length ? parts : null;
}

function parseLoadType(raw: FormDataEntryValue | null): ExerciseLoadType | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const v = raw.trim();
  if (v === "strength" || v === "stretch" || v === "balance" || v === "cardio" || v === "other") {
    return v;
  }
  return null;
}

function validateExerciseMedia(mediaUrl: string | null, mediaType: "image" | "video" | "gif" | null): string | null {
  if (mediaType && !mediaUrl) {
    return "Некорректные данные медиа: очистите медиа и выберите файл снова.";
  }
  if (mediaUrl && !mediaType) {
    return "Выберите файл из библиотеки — не указан тип медиа.";
  }
  if (mediaUrl && !(API_MEDIA_URL_RE.test(mediaUrl) || isLegacyAbsoluteUrl(mediaUrl))) {
    return "Медиа должно быть из библиотеки файлов (/api/media/…) или допустимый legacy URL (https://…).";
  }
  return null;
}

export const bulkCreateExerciseMediaItemSchema = z.object({
  title: z.string().min(1).max(500),
  mediaUrl: z.string().min(1).max(500),
  mediaType: z.enum(["image", "video", "gif"]),
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
  const session = await requireDoctorAccess();
  const userId = session.user.userId;

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
      event: "lfk_exercises_bulk_auto_create_start",
      userId,
      requestedCount: items.length,
      dedupedCount: deduped.length,
    },
    "lfk_exercises_bulk_auto_create_start",
  );

  const deps = buildAppDeps();
  const mediaIds = deduped.map((i) => parseMediaFileIdFromAppUrl(i.mediaUrl)).filter((id): id is string => Boolean(id));

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
    usageByMediaId = await pgListExerciseUsageForMediaIds(mediaIds);
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
    const mediaErr = validateExerciseMedia(row.mediaUrl, row.mediaType);
    if (mediaErr) {
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
        { event: "lfk_exercises_bulk_auto_create_item_failed", userId, mediaId, err: e },
        "lfk_exercises_bulk_auto_create_item_failed",
      );
      failed += 1;
    }
  }

  logger.info(
    {
      event: "lfk_exercises_bulk_auto_create_finish",
      userId,
      created,
      skippedLinked,
      failed,
      createdIds,
    },
    "lfk_exercises_bulk_auto_create_finish",
  );

  return { ok: true, created, skippedLinked, failed, createdIds };
}

export async function saveDoctorExerciseCore(formData: FormData): Promise<SaveExerciseResult> {
  const session = await requireDoctorAccess();
  const idRaw = formData.get("id");
  const id = typeof idRaw === "string" && idRaw.trim() ? idRaw.trim() : null;

  const title = (formData.get("title") as string)?.trim() ?? "";
  if (!title) {
    return { ok: false, error: "Укажите название" };
  }

  const description = (formData.get("description") as string)?.trim() || null;
  const regionRefRaw = formData.get("regionRefId");
  const regionRefId = typeof regionRefRaw === "string" && regionRefRaw.trim() ? regionRefRaw.trim() : null;
  const loadType = parseLoadType(formData.get("loadType"));
  const diffRaw = formData.get("difficulty1_10");
  let difficulty1_10: number | null = null;
  if (typeof diffRaw === "string" && diffRaw.trim()) {
    const n = Number.parseInt(diffRaw, 10);
    if (!Number.isNaN(n) && n >= 1 && n <= 10) difficulty1_10 = n;
  }
  const contraindications = (formData.get("contraindications") as string)?.trim() || null;
  const tags = parseTags(formData.get("tags"));

  const mediaUrlRaw = (formData.get("mediaUrl") as string)?.trim() || "";
  const mediaUrl = mediaUrlRaw.length ? mediaUrlRaw : null;
  const mediaTypeRaw = formData.get("mediaType");
  const mediaType =
    mediaTypeRaw === "image" || mediaTypeRaw === "video" || mediaTypeRaw === "gif" ? mediaTypeRaw : null;

  const mediaError = validateExerciseMedia(mediaUrl, mediaType);
  if (mediaError) {
    return { ok: false, error: mediaError };
  }

  const deps = buildAppDeps();
  if (id) {
    await deps.lfkExercises.updateExercise(id, {
      title,
      description,
      regionRefId,
      loadType,
      difficulty1_10,
      contraindications,
      tags,
      media: mediaUrl && mediaType ? [{ mediaUrl, mediaType, sortOrder: 0 }] : [],
    });
    return { ok: true, exerciseId: id, wasUpdate: true };
  }

  const created = await deps.lfkExercises.createExercise(
    {
      title,
      description,
      regionRefId,
      loadType,
      difficulty1_10,
      contraindications,
      tags,
      media: mediaUrl && mediaType ? [{ mediaUrl, mediaType, sortOrder: 0 }] : undefined,
    },
    session.user.userId,
  );
  return { ok: true, exerciseId: created.id, wasUpdate: false };
}

export async function archiveDoctorExerciseCore(formData: FormData): Promise<ArchiveDoctorExerciseCoreResult> {
  await requireDoctorAccess();
  const idRaw = formData.get("id");
  const id = typeof idRaw === "string" ? idRaw.trim() : "";
  if (!id) return { kind: "invalid", error: "Не указано упражнение" };

  const acknowledgeUsageWarning = parseAcknowledgeUsageWarning(formData);
  const deps = buildAppDeps();
  try {
    await deps.lfkExercises.archiveExercise(id, { acknowledgeUsageWarning });
    return { kind: "archived", id };
  } catch (e) {
    if (isUsageConfirmationRequiredError(e)) {
      return { kind: "needs_confirmation", usage: e.usage };
    }
    if (isExerciseArchiveNotFoundError(e)) {
      return { kind: "invalid", error: e.message };
    }
    if (isExerciseArchiveAlreadyArchivedError(e)) {
      return { kind: "invalid", error: e.message };
    }
    logger.warn({ event: "doctor_exercise_archive_unexpected_error", exerciseId: id, err: e }, "archive failed");
    return { kind: "invalid", error: "Не удалось архивировать упражнение" };
  }
}
