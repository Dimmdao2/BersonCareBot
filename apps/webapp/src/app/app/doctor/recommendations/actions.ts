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
  unarchiveRecommendationCore,
  type ArchiveRecommendationState,
  type SaveRecommendationState,
  type UnarchiveRecommendationState,
} from "./actionsShared";
import { appendRecommendationsCatalogFiltersToSearchParams } from "./recommendationsListPreserveParams";

export type { ArchiveRecommendationState, UnarchiveRecommendationState } from "./actionsShared";

function listPreserveFieldString(fd: FormData, name: string): string | undefined {
  const v = fd.get(name);
  return typeof v === "string" ? v.trim() : undefined;
}

function appendListPreserveFromFormData(sp: URLSearchParams, fd: FormData): void {
  const ts = fd.get("listTitleSort");
  const titleSort = ts === "asc" || ts === "desc" ? ts : null;
  const st = fd.get("listStatus");
  const listStatus =
    st === "active" || st === "all" || st === "archived" ? (st as "active" | "all" | "archived") : undefined;
  appendRecommendationsCatalogFiltersToSearchParams(sp, {
    q: listPreserveFieldString(fd, "listQ"),
    titleSort,
    regionCode: listPreserveFieldString(fd, "listRegion"),
    domain: listPreserveFieldString(fd, "listDomain"),
    listStatus,
  });
}

export async function saveRecommendation(
  _prev: SaveRecommendationState | null,
  formData: FormData,
): Promise<SaveRecommendationState> {
  const result = await saveRecommendationCore(formData);
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath(RECOMMENDATIONS_PATH);
  revalidatePath(`${RECOMMENDATIONS_PATH}/${result.recommendationId}`);
  const sp = new URLSearchParams();
  appendListPreserveFromFormData(sp, formData);
  const qs = sp.toString();
  redirect(
    qs
      ? `${RECOMMENDATIONS_PATH}/${result.recommendationId}?${qs}`
      : `${RECOMMENDATIONS_PATH}/${result.recommendationId}`,
  );
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
    if (!id) {
      const sp = new URLSearchParams();
      appendListPreserveFromFormData(sp, formData);
      const qs = sp.toString();
      redirect(qs ? `${RECOMMENDATIONS_PATH}?${qs}` : RECOMMENDATIONS_PATH);
    }
    return { ok: false, error: result.error };
  }
  revalidatePath(RECOMMENDATIONS_PATH);
  revalidatePath(`${RECOMMENDATIONS_PATH}/${result.id}`);
  const sp = new URLSearchParams();
  appendListPreserveFromFormData(sp, formData);
  const qs = sp.toString();
  redirect(qs ? `${RECOMMENDATIONS_PATH}?${qs}` : RECOMMENDATIONS_PATH);
}

export async function unarchiveRecommendation(
  _prev: UnarchiveRecommendationState | null,
  formData: FormData,
): Promise<UnarchiveRecommendationState> {
  const result = await unarchiveRecommendationCore(formData);
  if (result.kind === "invalid") {
    return { ok: false, error: result.error };
  }
  revalidatePath(RECOMMENDATIONS_PATH);
  revalidatePath(`${RECOMMENDATIONS_PATH}/${result.id}`);
  const sp = new URLSearchParams();
  appendListPreserveFromFormData(sp, formData);
  const qs = sp.toString();
  redirect(qs ? `${RECOMMENDATIONS_PATH}/${result.id}?${qs}` : `${RECOMMENDATIONS_PATH}/${result.id}`);
}

export async function fetchDoctorRecommendationUsageSnapshot(recommendationId: string) {
  await requireDoctorAccess();
  const id = recommendationId.trim();
  if (!id) return { ...EMPTY_RECOMMENDATION_USAGE_SNAPSHOT };
  const deps = buildAppDeps();
  return deps.recommendations.getRecommendationUsage(id);
}
