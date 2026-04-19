"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  archiveClinicalTestCore,
  CLINICAL_TESTS_PATH,
  saveClinicalTestCore,
  type SaveClinicalTestState,
} from "./actionsShared";

export async function saveClinicalTestInline(
  _prev: SaveClinicalTestState | null,
  formData: FormData,
): Promise<SaveClinicalTestState> {
  const result = await saveClinicalTestCore(formData);
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath(CLINICAL_TESTS_PATH);
  revalidatePath(`${CLINICAL_TESTS_PATH}/${result.testId}`);
  const view = formData.get("view") === "list" ? "list" : "tiles";
  redirect(`${CLINICAL_TESTS_PATH}?selected=${encodeURIComponent(result.testId)}&view=${view}`);
}

export async function archiveClinicalTestInline(formData: FormData) {
  const result = await archiveClinicalTestCore(formData);
  const view = formData.get("view") === "list" ? "list" : "tiles";
  if (!result.archivedId) redirect(`${CLINICAL_TESTS_PATH}?view=${view}`);
  revalidatePath(CLINICAL_TESTS_PATH);
  redirect(`${CLINICAL_TESTS_PATH}?view=${view}`);
}
