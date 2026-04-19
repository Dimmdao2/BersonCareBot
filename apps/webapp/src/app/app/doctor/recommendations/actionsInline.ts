"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  archiveRecommendationCore,
  RECOMMENDATIONS_PATH,
  saveRecommendationCore,
  type SaveRecommendationState,
} from "./actionsShared";

export async function saveRecommendationInline(
  _prev: SaveRecommendationState | null,
  formData: FormData,
): Promise<SaveRecommendationState> {
  const result = await saveRecommendationCore(formData);
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath(RECOMMENDATIONS_PATH);
  revalidatePath(`${RECOMMENDATIONS_PATH}/${result.recommendationId}`);
  redirect(`${RECOMMENDATIONS_PATH}?selected=${encodeURIComponent(result.recommendationId)}`);
}

export async function archiveRecommendationInline(formData: FormData) {
  const result = await archiveRecommendationCore(formData);
  if (!result.archivedId) redirect(RECOMMENDATIONS_PATH);
  revalidatePath(RECOMMENDATIONS_PATH);
  redirect(RECOMMENDATIONS_PATH);
}
