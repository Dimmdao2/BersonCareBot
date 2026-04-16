"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  archiveDoctorExerciseCore,
  EXERCISES_PATH,
  saveDoctorExerciseCore,
  type SaveDoctorExerciseState,
} from "./actionsShared";

export async function saveExerciseInline(
  _prev: SaveDoctorExerciseState | null,
  formData: FormData,
): Promise<SaveDoctorExerciseState> {
  const result = await saveDoctorExerciseCore(formData);
  if (!result.ok) return result;

  revalidatePath(EXERCISES_PATH);
  if (result.wasUpdate) {
    revalidatePath(`${EXERCISES_PATH}/${result.exerciseId}`);
  }
  const view = formData.get("view") === "tiles" ? "tiles" : "list";
  redirect(`${EXERCISES_PATH}?view=${view}&selected=${encodeURIComponent(result.exerciseId)}`);
}

export async function archiveExerciseInline(formData: FormData) {
  const result = await archiveDoctorExerciseCore(formData);
  const view = formData.get("view") === "tiles" ? "tiles" : "list";
  if (!result.archivedId) redirect(`${EXERCISES_PATH}?view=${view}`);
  revalidatePath(EXERCISES_PATH);
  redirect(`${EXERCISES_PATH}?view=${view}`);
}
