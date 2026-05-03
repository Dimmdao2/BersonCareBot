"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  archiveDoctorExerciseCore,
  EXERCISES_PATH,
  saveDoctorExerciseCore,
  unarchiveDoctorExerciseCore,
  type ArchiveDoctorExerciseState,
  type SaveDoctorExerciseState,
  type UnarchiveDoctorExerciseState,
} from "./actionsShared";

function exercisesCatalogRedirectSearchParams(
  formData: FormData,
  view: "tiles" | "list",
  extra?: { selected?: string },
): string {
  const p = new URLSearchParams();
  p.set("view", view);
  if (extra?.selected) p.set("selected", extra.selected);
  const st = formData.get("status");
  if (st === "active" || st === "all" || st === "archived") p.set("status", st);
  return p.toString();
}

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
  redirect(
    `${EXERCISES_PATH}?${exercisesCatalogRedirectSearchParams(formData, view, { selected: result.exerciseId })}`,
  );
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
    if (!id) redirect(`${EXERCISES_PATH}?${exercisesCatalogRedirectSearchParams(formData, view)}`);
    return { ok: false, error: result.error };
  }
  revalidatePath(EXERCISES_PATH);
  redirect(`${EXERCISES_PATH}?${exercisesCatalogRedirectSearchParams(formData, view)}`);
}

export async function unarchiveExerciseInline(
  _prev: UnarchiveDoctorExerciseState | null,
  formData: FormData,
): Promise<UnarchiveDoctorExerciseState> {
  const result = await unarchiveDoctorExerciseCore(formData);
  const view = formData.get("view") === "tiles" ? "tiles" : "list";
  if (result.kind === "invalid") {
    const idRaw = formData.get("id");
    const id = typeof idRaw === "string" ? idRaw.trim() : "";
    if (!id) redirect(`${EXERCISES_PATH}?${exercisesCatalogRedirectSearchParams(formData, view)}`);
    return { ok: false, error: result.error };
  }
  revalidatePath(EXERCISES_PATH);
  revalidatePath(`${EXERCISES_PATH}/${result.id}`);
  const idRaw = formData.get("id");
  const id = typeof idRaw === "string" ? idRaw.trim() : "";
  redirect(
    `${EXERCISES_PATH}?${exercisesCatalogRedirectSearchParams(formData, view, { selected: id || result.id })}`,
  );
}
