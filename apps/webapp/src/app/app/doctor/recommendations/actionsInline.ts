"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  archiveRecommendationCore,
  RECOMMENDATIONS_PATH,
  saveRecommendationCore,
  type SaveRecommendationState,
} from "./actionsShared";

function appendRecommendationsListParams(sp: URLSearchParams, formData: FormData) {
  const q = formData.get("listQ");
  if (typeof q === "string" && q.trim()) sp.set("q", q.trim());
  const ts = formData.get("listTitleSort");
  if (ts === "asc" || ts === "desc") sp.set("titleSort", ts);
  const listStatus = formData.get("listStatus");
  if (
    listStatus === "all" ||
    listStatus === "draft" ||
    listStatus === "published" ||
    listStatus === "archived"
  ) {
    sp.set("status", String(listStatus));
  }
  const region = formData.get("listRegion");
  if (typeof region === "string" && region.trim()) sp.set("region", region.trim());
  const load = formData.get("listLoad");
  if (load === "strength" || load === "stretch" || load === "balance" || load === "cardio" || load === "other") {
    sp.set("load", load);
  }
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

export async function archiveRecommendationInline(formData: FormData) {
  const result = await archiveRecommendationCore(formData);
  const view = formData.get("view") === "list" ? "list" : "tiles";
  const sp = new URLSearchParams();
  sp.set("view", view);
  appendRecommendationsListParams(sp, formData);
  const qs = sp.toString();
  if (!result.archivedId) redirect(`${RECOMMENDATIONS_PATH}?${qs}`);
  revalidatePath(RECOMMENDATIONS_PATH);
  redirect(`${RECOMMENDATIONS_PATH}?${qs}`);
}
