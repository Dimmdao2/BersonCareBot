"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { EMPTY_CLINICAL_TEST_USAGE_SNAPSHOT } from "@/modules/tests/types";
import {
  archiveClinicalTestCore,
  CLINICAL_TESTS_PATH,
  saveClinicalTestCore,
  unarchiveClinicalTestCore,
  type ArchiveClinicalTestState,
  type SaveClinicalTestState,
  type UnarchiveClinicalTestState,
} from "./actionsShared";

export type { ArchiveClinicalTestState, UnarchiveClinicalTestState } from "./actionsShared";

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

export async function archiveClinicalTest(
  _prev: ArchiveClinicalTestState | null,
  formData: FormData,
): Promise<ArchiveClinicalTestState> {
  const result = await archiveClinicalTestCore(formData);
  if (result.kind === "needs_confirmation") {
    return { ok: false, code: "USAGE_CONFIRMATION_REQUIRED", usage: result.usage };
  }
  if (result.kind === "invalid") {
    const idRaw = formData.get("id");
    const id = typeof idRaw === "string" ? idRaw.trim() : "";
    if (!id) redirect(CLINICAL_TESTS_PATH);
    return { ok: false, error: result.error };
  }
  revalidatePath(CLINICAL_TESTS_PATH);
  revalidatePath(`${CLINICAL_TESTS_PATH}/${result.id}`);
  redirect(CLINICAL_TESTS_PATH);
}

export async function unarchiveClinicalTest(
  _prev: UnarchiveClinicalTestState | null,
  formData: FormData,
): Promise<UnarchiveClinicalTestState> {
  const result = await unarchiveClinicalTestCore(formData);
  if (result.kind === "invalid") {
    return { ok: false, error: result.error };
  }
  revalidatePath(CLINICAL_TESTS_PATH);
  revalidatePath(`${CLINICAL_TESTS_PATH}/${result.id}`);
  redirect(`${CLINICAL_TESTS_PATH}/${result.id}`);
}

export async function fetchDoctorClinicalTestUsageSnapshot(clinicalTestId: string) {
  await requireDoctorAccess();
  const id = clinicalTestId.trim();
  if (!id) return { ...EMPTY_CLINICAL_TEST_USAGE_SNAPSHOT };
  const deps = buildAppDeps();
  return deps.clinicalTests.getClinicalTestUsage(id);
}
