"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  archiveTestSetCore,
  saveTestSetCore,
  saveTestSetItemsCore,
  TEST_SETS_PATH,
  type SaveTestSetState,
} from "./actionsShared";

export async function saveDoctorTestSetInline(
  _prev: SaveTestSetState | null,
  formData: FormData,
): Promise<SaveTestSetState> {
  const result = await saveTestSetCore(formData);
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath(TEST_SETS_PATH);
  revalidatePath(`${TEST_SETS_PATH}/${result.setId}`);
  redirect(`${TEST_SETS_PATH}?selected=${encodeURIComponent(result.setId)}`);
}

export async function saveDoctorTestSetItemsInline(
  _prev: SaveTestSetState | null,
  formData: FormData,
): Promise<SaveTestSetState> {
  const result = await saveTestSetItemsCore(formData);
  if (!result.ok) return { ok: false, error: result.error };

  const setIdRaw = formData.get("setId");
  const setId = typeof setIdRaw === "string" ? setIdRaw.trim() : "";
  revalidatePath(TEST_SETS_PATH);
  if (setId) {
    revalidatePath(`${TEST_SETS_PATH}/${setId}`);
  }
  return { ok: true };
}

export async function archiveDoctorTestSetInline(formData: FormData) {
  const result = await archiveTestSetCore(formData);
  if (!result.archivedId) redirect(TEST_SETS_PATH);
  revalidatePath(TEST_SETS_PATH);
  redirect(TEST_SETS_PATH);
}
