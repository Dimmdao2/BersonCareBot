"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
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

function appendTestSetsListParams(sp: URLSearchParams, formData: FormData) {
  const q = formData.get("listQ");
  if (typeof q === "string" && q.trim()) sp.set("q", q.trim());
  const ts = formData.get("listTitleSort");
  if (ts === "asc" || ts === "desc") sp.set("titleSort", ts);
  const region = formData.get("listRegion");
  if (typeof region === "string" && region.trim()) sp.set("region", region.trim());
  const load = formData.get("listLoad");
  if (load === "strength" || load === "stretch" || load === "balance" || load === "cardio" || load === "other") {
    sp.set("load", load);
  }
  sp.delete("status");
  const listArch = formData.get("listArch");
  if (listArch === "archived") sp.set("arch", "archived");
  else sp.delete("arch");
  const listPub = formData.get("listPub");
  if (listPub === "draft" || listPub === "published") sp.set("pub", listPub);
  else sp.delete("pub");
}

export async function saveDoctorTestSetInline(
  _prev: SaveTestSetState | null,
  formData: FormData,
): Promise<SaveTestSetState> {
  const result = await saveTestSetCore(formData);
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath(TEST_SETS_PATH);
  revalidatePath(`${TEST_SETS_PATH}/${result.setId}`);
  const sp = new URLSearchParams();
  sp.set("selected", result.setId);
  appendTestSetsListParams(sp, formData);
  redirect(`${TEST_SETS_PATH}?${sp.toString()}`);
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

export async function archiveDoctorTestSetInline(
  _prev: ArchiveTestSetState | null,
  formData: FormData,
): Promise<ArchiveTestSetState> {
  const result = await archiveTestSetCore(formData);
  if (result.kind === "needs_confirmation") {
    return { ok: false, code: "USAGE_CONFIRMATION_REQUIRED", usage: result.usage };
  }
  const sp = new URLSearchParams();
  appendTestSetsListParams(sp, formData);
  const qs = sp.toString();
  if (result.kind === "invalid") {
    const idRaw = formData.get("id");
    const id = typeof idRaw === "string" ? idRaw.trim() : "";
    if (!id) redirect(`${TEST_SETS_PATH}?${qs}`);
    return { ok: false, error: result.error };
  }
  revalidatePath(TEST_SETS_PATH);
  redirect(`${TEST_SETS_PATH}?${qs}`);
}

export async function unarchiveDoctorTestSetInline(
  _prev: UnarchiveTestSetState | null,
  formData: FormData,
): Promise<UnarchiveTestSetState> {
  const result = await unarchiveTestSetCore(formData);
  if (result.kind === "invalid") {
    return { ok: false, error: result.error };
  }
  revalidatePath(TEST_SETS_PATH);
  revalidatePath(`${TEST_SETS_PATH}/${result.id}`);
  const sp = new URLSearchParams();
  sp.set("selected", result.id);
  appendTestSetsListParams(sp, formData);
  redirect(`${TEST_SETS_PATH}?${sp.toString()}`);
}
