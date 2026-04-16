"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { logger } from "@/infra/logging/logger";
import {
  archiveDoctorExerciseCore,
  bulkCreateExercisesFromMediaCore,
  bulkCreateExercisesFromMediaInputSchema,
  EXERCISES_PATH,
  saveDoctorExerciseCore,
  type BulkCreateExercisesFromMediaResult,
  type SaveDoctorExerciseState,
} from "./actionsShared";

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

export async function archiveDoctorExercise(formData: FormData) {
  const result = await archiveDoctorExerciseCore(formData);
  if (!result.archivedId) redirect(EXERCISES_PATH);
  revalidatePath(EXERCISES_PATH);
  redirect(EXERCISES_PATH);
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
