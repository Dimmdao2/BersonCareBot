import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import type { ExerciseLoadType } from "@/modules/lfk-exercises/types";
import { API_MEDIA_URL_RE, isLegacyAbsoluteUrl } from "@/shared/lib/mediaUrlPolicy";

export type SaveDoctorExerciseState = { ok: boolean; error?: string };

export const EXERCISES_PATH = "/app/doctor/exercises";

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

export async function archiveDoctorExerciseCore(formData: FormData): Promise<{ archivedId: string | null }> {
  await requireDoctorAccess();
  const idRaw = formData.get("id");
  const id = typeof idRaw === "string" ? idRaw.trim() : "";
  if (!id) return { archivedId: null };

  const deps = buildAppDeps();
  try {
    await deps.lfkExercises.archiveExercise(id);
  } catch {
    /* ignore not found */
  }
  return { archivedId: id };
}
