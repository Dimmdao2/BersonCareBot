"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  archiveRecommendationCore,
  RECOMMENDATIONS_PATH,
  saveRecommendationCore,
  type SaveRecommendationState,
} from "./actionsShared";

export async function saveRecommendation(
  _prev: SaveRecommendationState | null,
  formData: FormData,
): Promise<SaveRecommendationState> {
  const result = await saveRecommendationCore(formData);
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath(RECOMMENDATIONS_PATH);
  if (result.wasUpdate) {
    revalidatePath(`${RECOMMENDATIONS_PATH}/${result.recommendationId}`);
  }
  redirect(`${RECOMMENDATIONS_PATH}/${result.recommendationId}`);
}

export async function archiveRecommendation(formData: FormData) {
  const result = await archiveRecommendationCore(formData);
  if (!result.archivedId) redirect(RECOMMENDATIONS_PATH);
  revalidatePath(RECOMMENDATIONS_PATH);
  redirect(RECOMMENDATIONS_PATH);
}
