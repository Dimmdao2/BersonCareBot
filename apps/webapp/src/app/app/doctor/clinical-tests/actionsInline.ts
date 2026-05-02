"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  archiveClinicalTestCore,
  CLINICAL_TESTS_PATH,
  saveClinicalTestCore,
  unarchiveClinicalTestCore,
  type ArchiveClinicalTestState,
  type SaveClinicalTestState,
  type UnarchiveClinicalTestState,
} from "./actionsShared";

function appendClinicalTestsListParams(sp: URLSearchParams, formData: FormData) {
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
  const listStatus = formData.get("listStatus");
  if (listStatus === "active" || listStatus === "all" || listStatus === "archived") {
    sp.set("status", listStatus);
  }
}

export async function saveClinicalTestInline(
  _prev: SaveClinicalTestState | null,
  formData: FormData,
): Promise<SaveClinicalTestState> {
  const result = await saveClinicalTestCore(formData);
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath(CLINICAL_TESTS_PATH);
  revalidatePath(`${CLINICAL_TESTS_PATH}/${result.testId}`);
  const view = formData.get("view") === "list" ? "list" : "tiles";
  const sp = new URLSearchParams();
  sp.set("selected", result.testId);
  sp.set("view", view);
  appendClinicalTestsListParams(sp, formData);
  redirect(`${CLINICAL_TESTS_PATH}?${sp.toString()}`);
}

export async function archiveClinicalTestInline(
  _prev: ArchiveClinicalTestState | null,
  formData: FormData,
): Promise<ArchiveClinicalTestState> {
  const result = await archiveClinicalTestCore(formData);
  if (result.kind === "needs_confirmation") {
    return { ok: false, code: "USAGE_CONFIRMATION_REQUIRED", usage: result.usage };
  }
  const view = formData.get("view") === "list" ? "list" : "tiles";
  const sp = new URLSearchParams();
  sp.set("view", view);
  appendClinicalTestsListParams(sp, formData);
  const qs = sp.toString();
  if (result.kind === "invalid") {
    const idRaw = formData.get("id");
    const id = typeof idRaw === "string" ? idRaw.trim() : "";
    if (!id) redirect(`${CLINICAL_TESTS_PATH}?${qs}`);
    return { ok: false, error: result.error };
  }
  revalidatePath(CLINICAL_TESTS_PATH);
  redirect(`${CLINICAL_TESTS_PATH}?${qs}`);
}

export async function unarchiveClinicalTestInline(
  _prev: UnarchiveClinicalTestState | null,
  formData: FormData,
): Promise<UnarchiveClinicalTestState> {
  const result = await unarchiveClinicalTestCore(formData);
  if (result.kind === "invalid") {
    return { ok: false, error: result.error };
  }
  revalidatePath(CLINICAL_TESTS_PATH);
  revalidatePath(`${CLINICAL_TESTS_PATH}/${result.id}`);
  const view = formData.get("view") === "list" ? "list" : "tiles";
  const sp = new URLSearchParams();
  sp.set("view", view);
  sp.set("selected", result.id);
  appendClinicalTestsListParams(sp, formData);
  redirect(`${CLINICAL_TESTS_PATH}?${sp.toString()}`);
}
