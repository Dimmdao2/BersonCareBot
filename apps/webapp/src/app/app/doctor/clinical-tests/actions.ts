"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  archiveClinicalTestCore,
  CLINICAL_TESTS_PATH,
  saveClinicalTestCore,
  type SaveClinicalTestState,
} from "./actionsShared";

export async function saveClinicalTest(
  _prev: SaveClinicalTestState | null,
  formData: FormData,
): Promise<SaveClinicalTestState> {
  const result = await saveClinicalTestCore(formData);
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath(CLINICAL_TESTS_PATH);
  if (result.wasUpdate) {
    revalidatePath(`${CLINICAL_TESTS_PATH}/${result.testId}`);
  }
  redirect(`${CLINICAL_TESTS_PATH}/${result.testId}`);
}

export async function archiveClinicalTest(formData: FormData) {
  const result = await archiveClinicalTestCore(formData);
  if (!result.archivedId) redirect(CLINICAL_TESTS_PATH);
  revalidatePath(CLINICAL_TESTS_PATH);
  redirect(CLINICAL_TESTS_PATH);
}
