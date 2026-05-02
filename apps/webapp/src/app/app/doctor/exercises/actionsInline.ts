"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  archiveDoctorExerciseCore,
  EXERCISES_PATH,
  saveDoctorExerciseCore,
  type ArchiveDoctorExerciseState,
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

export async function archiveExerciseInline(
  _prev: ArchiveDoctorExerciseState | null,
  formData: FormData,
): Promise<ArchiveDoctorExerciseState> {
  const result = await archiveDoctorExerciseCore(formData);
  if (result.kind === "needs_confirmation") {
    return { ok: false, code: "USAGE_CONFIRMATION_REQUIRED", usage: result.usage };
  }
  const view = formData.get("view") === "tiles" ? "tiles" : "list";
  if (result.kind === "invalid") {
    const idRaw = formData.get("id");
    const id = typeof idRaw === "string" ? idRaw.trim() : "";
    if (!id) redirect(`${EXERCISES_PATH}?view=${view}`);
    return { ok: false, error: result.error };
  }
  revalidatePath(EXERCISES_PATH);
  redirect(`${EXERCISES_PATH}?view=${view}`);
}
