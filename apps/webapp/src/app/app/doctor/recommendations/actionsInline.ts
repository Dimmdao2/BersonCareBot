"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { parseRecommendationDomain } from "@/modules/recommendations/recommendationDomain";
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
  const region = formData.get("listRegion");
  if (typeof region === "string" && region.trim()) sp.set("region", region.trim());
  const listDomain = formData.get("listDomain");
  if (typeof listDomain === "string" && listDomain.trim()) {
    const d = parseRecommendationDomain(listDomain.trim());
    if (d) sp.set("domain", d);
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
