"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { EMPTY_TEST_SET_USAGE_SNAPSHOT } from "@/modules/tests/types";
import {
  archiveTestSetCore,
  saveTestSetCore,
  saveTestSetItemsCore,
  TEST_SETS_PATH,
  unarchiveTestSetCore,
  type ArchiveTestSetState,
  type SaveTestSetState,
  type UnarchiveTestSetState,
} from "./actionsShared";

export type { ArchiveTestSetState, UnarchiveTestSetState } from "./actionsShared";

export async function saveDoctorTestSet(
  _prev: SaveTestSetState | null,
  formData: FormData,
): Promise<SaveTestSetState> {
  const result = await saveTestSetCore(formData);
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath(TEST_SETS_PATH);
  revalidatePath(`${TEST_SETS_PATH}/${result.setId}`);
  if (!result.wasUpdate) {
    redirect(`${TEST_SETS_PATH}/${result.setId}`);
  }
  redirect(`${TEST_SETS_PATH}/${result.setId}`);
}

export async function saveDoctorTestSetItems(
  _prev: SaveTestSetState | null,
  formData: FormData,
): Promise<SaveTestSetState> {
  const result = await saveTestSetItemsCore(formData);
  if (!result.ok) return { ok: false, error: result.error };

  const setIdField = formData.get("setId");
  const setId = typeof setIdField === "string" ? setIdField.trim() : "";
  if (setId) {
    revalidatePath(TEST_SETS_PATH);
    revalidatePath(`${TEST_SETS_PATH}/${setId}`);
  }
  return { ok: true };
}

export async function archiveDoctorTestSet(
  _prev: ArchiveTestSetState | null,
  formData: FormData,
): Promise<ArchiveTestSetState> {
  const result = await archiveTestSetCore(formData);
  if (result.kind === "needs_confirmation") {
    return { ok: false, code: "USAGE_CONFIRMATION_REQUIRED", usage: result.usage };
  }
  if (result.kind === "invalid") {
    const idRaw = formData.get("id");
    const id = typeof idRaw === "string" ? idRaw.trim() : "";
    if (!id) redirect(TEST_SETS_PATH);
    return { ok: false, error: result.error };
  }
  revalidatePath(TEST_SETS_PATH);
  revalidatePath(`${TEST_SETS_PATH}/${result.id}`);
  redirect(TEST_SETS_PATH);
}

export async function unarchiveDoctorTestSet(
  _prev: UnarchiveTestSetState | null,
  formData: FormData,
): Promise<UnarchiveTestSetState> {
  const result = await unarchiveTestSetCore(formData);
  if (result.kind === "invalid") {
    return { ok: false, error: result.error };
  }
  revalidatePath(TEST_SETS_PATH);
  revalidatePath(`${TEST_SETS_PATH}/${result.id}`);
  redirect(`${TEST_SETS_PATH}/${result.id}`);
}

export async function fetchDoctorTestSetUsageSnapshot(testSetId: string) {
  await requireDoctorAccess();
  const id = testSetId.trim();
  if (!id) return { ...EMPTY_TEST_SET_USAGE_SNAPSHOT };
  const deps = buildAppDeps();
  return deps.testSets.getTestSetUsage(id);
}
