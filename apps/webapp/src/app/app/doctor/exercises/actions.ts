"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { logger } from "@/infra/logging/logger";
import { EMPTY_EXERCISE_USAGE_SNAPSHOT } from "@/modules/lfk-exercises/types";
import {
  archiveDoctorExerciseCore,
  bulkCreateExercisesFromMediaCore,
  bulkCreateExercisesFromMediaInputSchema,
  EXERCISES_PATH,
  saveDoctorExerciseCore,
  type ArchiveDoctorExerciseState,
  type BulkCreateExercisesFromMediaResult,
  type SaveDoctorExerciseState,
} from "./actionsShared";

export type { ArchiveDoctorExerciseState } from "./actionsShared";

/** Создание или обновление упражнения из формы врача. */
export async function saveDoctorExercise(
  _prev: SaveDoctorExerciseState | null,
  formData: FormData,
): Promise<SaveDoctorExerciseState> {
  const result = await saveDoctorExerciseCore(formData);
  if (!result.ok) return result;

  revalidatePath(EXERCISES_PATH);
  if (result.wasUpdate) {
    revalidatePath(`${EXERCISES_PATH}/${result.exerciseId}`);
  }
  redirect(`${EXERCISES_PATH}/${result.exerciseId}`);
}

export async function archiveDoctorExercise(
  _prev: ArchiveDoctorExerciseState | null,
  formData: FormData,
): Promise<ArchiveDoctorExerciseState> {
  const result = await archiveDoctorExerciseCore(formData);
  if (result.kind === "needs_confirmation") {
    return { ok: false, code: "USAGE_CONFIRMATION_REQUIRED", usage: result.usage };
  }
  if (result.kind === "invalid") {
    const idRaw = formData.get("id");
    const id = typeof idRaw === "string" ? idRaw.trim() : "";
    if (!id) redirect(EXERCISES_PATH);
    return { ok: false, error: result.error };
  }
  revalidatePath(EXERCISES_PATH);
  revalidatePath(`${EXERCISES_PATH}/${result.id}`);
  redirect(EXERCISES_PATH);
}

/** Загрузка usage для формы, когда нет server-passed snapshot (split-view без `selected` в URL). */
export async function fetchDoctorExerciseUsageSnapshot(exerciseId: string) {
  await requireDoctorAccess();
  const id = exerciseId.trim();
  if (!id) return { ...EMPTY_EXERCISE_USAGE_SNAPSHOT };
  const deps = buildAppDeps();
  return deps.lfkExercises.getExerciseUsage(id);
}

/** Массовое создание упражнений из выбранных файлов библиотеки (только `/api/media/{uuid}`). */
export async function bulkCreateExercisesFromMedia(
  items: unknown,
): Promise<BulkCreateExercisesFromMediaResult> {
  const parsed = bulkCreateExercisesFromMediaInputSchema.safeParse(items);
  if (!parsed.success) {
    logger.warn(
      { event: "lfk_exercises_bulk_auto_create_invalid_input", issues: parsed.error.flatten() },
      "lfk_exercises_bulk_auto_create_invalid_input",
    );
    return { ok: false, error: "Некорректные данные запроса" };
  }
  const result = await bulkCreateExercisesFromMediaCore(parsed.data);
  if (!result.ok) return result;
  revalidatePath(EXERCISES_PATH);
  return result;
}
