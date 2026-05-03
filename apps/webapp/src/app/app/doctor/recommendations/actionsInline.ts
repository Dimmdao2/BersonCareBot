"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  archiveRecommendationCore,
  RECOMMENDATIONS_PATH,
  saveRecommendationCore,
  unarchiveRecommendationCore,
  type ArchiveRecommendationState,
  type SaveRecommendationState,
  type UnarchiveRecommendationState,
} from "./actionsShared";
import { appendRecommendationsListPreserveToSearchParams } from "./recommendationsListPreserveParams";

function appendRecommendationsListParams(sp: URLSearchParams, formData: FormData) {
  appendRecommendationsListPreserveToSearchParams(sp, formData);
}

export async function saveRecommendationInline(
  _prev: SaveRecommendationState | null,
  formData: FormData,
): Promise<SaveRecommendationState> {
  const result = await saveRecommendationCore(formData);
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath(RECOMMENDATIONS_PATH);
  revalidatePath(`${RECOMMENDATIONS_PATH}/${result.recommendationId}`);
  const view = formData.get("view") === "list" ? "list" : "tiles";
  const sp = new URLSearchParams();
  sp.set("selected", result.recommendationId);
  sp.set("view", view);
  appendRecommendationsListParams(sp, formData);
  redirect(`${RECOMMENDATIONS_PATH}?${sp.toString()}`);
}

export async function archiveRecommendationInline(
  _prev: ArchiveRecommendationState | null,
  formData: FormData,
): Promise<ArchiveRecommendationState> {
  const result = await archiveRecommendationCore(formData);
  if (result.kind === "needs_confirmation") {
    return { ok: false, code: "USAGE_CONFIRMATION_REQUIRED", usage: result.usage };
  }
  if (result.kind === "invalid") {
    const idRaw = formData.get("id");
    const id = typeof idRaw === "string" ? idRaw.trim() : "";
    if (!id) {
      const view = formData.get("view") === "list" ? "list" : "tiles";
      const sp = new URLSearchParams();
      sp.set("view", view);
      appendRecommendationsListParams(sp, formData);
      redirect(`${RECOMMENDATIONS_PATH}?${sp.toString()}`);
    }
    return { ok: false, error: result.error };
  }
  revalidatePath(RECOMMENDATIONS_PATH);
  const view = formData.get("view") === "list" ? "list" : "tiles";
  const sp = new URLSearchParams();
  sp.set("view", view);
  appendRecommendationsListParams(sp, formData);
  redirect(`${RECOMMENDATIONS_PATH}?${sp.toString()}`);
}

export async function unarchiveRecommendationInline(
  _prev: UnarchiveRecommendationState | null,
  formData: FormData,
): Promise<UnarchiveRecommendationState> {
  const result = await unarchiveRecommendationCore(formData);
  if (result.kind === "invalid") {
    return { ok: false, error: result.error };
  }
  revalidatePath(RECOMMENDATIONS_PATH);
  revalidatePath(`${RECOMMENDATIONS_PATH}/${result.id}`);
  const view = formData.get("view") === "list" ? "list" : "tiles";
  const sp = new URLSearchParams();
  sp.set("view", view);
  sp.set("selected", result.id);
  appendRecommendationsListParams(sp, formData);
  redirect(`${RECOMMENDATIONS_PATH}?${sp.toString()}`);
}
