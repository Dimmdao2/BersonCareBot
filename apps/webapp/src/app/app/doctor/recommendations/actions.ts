"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { EMPTY_RECOMMENDATION_USAGE_SNAPSHOT } from "@/modules/recommendations/types";
import {
  archiveRecommendationCore,
  RECOMMENDATIONS_PATH,
  saveRecommendationCore,
  type ArchiveRecommendationState,
  type SaveRecommendationState,
} from "./actionsShared";

export type { ArchiveRecommendationState } from "./actionsShared";

export async function saveRecommendation(
  _prev: SaveRecommendationState | null,
  formData: FormData,
): Promise<SaveRecommendationState> {
  const result = await saveRecommendationCore(formData);
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath(RECOMMENDATIONS_PATH);
  revalidatePath(`${RECOMMENDATIONS_PATH}/${result.recommendationId}`);
  redirect(`${RECOMMENDATIONS_PATH}/${result.recommendationId}`);
}

export async function archiveRecommendation(
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
    if (!id) redirect(RECOMMENDATIONS_PATH);
    return { ok: false, error: result.error };
  }
  revalidatePath(RECOMMENDATIONS_PATH);
  revalidatePath(`${RECOMMENDATIONS_PATH}/${result.id}`);
  redirect(RECOMMENDATIONS_PATH);
}

export async function fetchDoctorRecommendationUsageSnapshot(recommendationId: string) {
  await requireDoctorAccess();
  const id = recommendationId.trim();
  if (!id) return { ...EMPTY_RECOMMENDATION_USAGE_SNAPSHOT };
  const deps = buildAppDeps();
  return deps.recommendations.getRecommendationUsage(id);
}
