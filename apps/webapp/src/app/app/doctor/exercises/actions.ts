"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import type { ExerciseLoadType } from "@/modules/lfk-exercises/types";

const EXERCISES_PATH = "/app/doctor/exercises";

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

/** Создание или обновление упражнения из формы врача. */
export async function saveDoctorExercise(formData: FormData) {
  const session = await requireDoctorAccess();
  const idRaw = formData.get("id");
  const id = typeof idRaw === "string" && idRaw.trim() ? idRaw.trim() : null;

  const title = (formData.get("title") as string)?.trim() ?? "";
  const description = (formData.get("description") as string)?.trim() || null;
  const regionRefRaw = formData.get("regionRefId");
  const regionRefId =
    typeof regionRefRaw === "string" && regionRefRaw.trim() ? regionRefRaw.trim() : null;
  const loadType = parseLoadType(formData.get("loadType"));
  const diffRaw = formData.get("difficulty1_10");
  let difficulty1_10: number | null = null;
  if (typeof diffRaw === "string" && diffRaw.trim()) {
    const n = Number.parseInt(diffRaw, 10);
    if (!Number.isNaN(n) && n >= 1 && n <= 10) difficulty1_10 = n;
  }
  const contraindications = (formData.get("contraindications") as string)?.trim() || null;
  const tags = parseTags(formData.get("tags"));

  const mediaUrl = (formData.get("mediaUrl") as string)?.trim() || null;
  const mediaTypeRaw = formData.get("mediaType");
  const mediaType =
    mediaTypeRaw === "image" || mediaTypeRaw === "video" || mediaTypeRaw === "gif"
      ? mediaTypeRaw
      : null;

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
      media:
        mediaUrl && mediaType
          ? [{ mediaUrl, mediaType, sortOrder: 0 }]
          : mediaUrl === "" && !mediaType
            ? []
            : undefined,
    });
    revalidatePath(EXERCISES_PATH);
    revalidatePath(`${EXERCISES_PATH}/${id}`);
    redirect(`${EXERCISES_PATH}/${id}`);
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
    session.user.userId
  );
  revalidatePath(EXERCISES_PATH);
  redirect(`${EXERCISES_PATH}/${created.id}`);
}

export async function archiveDoctorExercise(formData: FormData) {
  await requireDoctorAccess();
  const idRaw = formData.get("id");
  const id = typeof idRaw === "string" ? idRaw.trim() : "";
  if (!id) redirect(EXERCISES_PATH);

  const deps = buildAppDeps();
  try {
    await deps.lfkExercises.archiveExercise(id);
  } catch {
    /* ignore not found */
  }
  revalidatePath(EXERCISES_PATH);
  redirect(EXERCISES_PATH);
}
