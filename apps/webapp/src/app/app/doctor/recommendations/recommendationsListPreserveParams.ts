import { appendRegionParamFromListPreserve } from "@/shared/lib/doctorCatalogClientUrlSync";

/** Сборка list-preserve query для redirect после inline save/archive/unarchive рекомендаций. В URL только `region` (код), не `regionRefId`. */
export function appendRecommendationsListPreserveToSearchParams(
  sp: URLSearchParams,
  formData: FormData,
): void {
  const q = formData.get("listQ");
  if (typeof q === "string" && q.trim()) sp.set("q", q.trim());
  const ts = formData.get("listTitleSort");
  if (ts === "asc" || ts === "desc") sp.set("titleSort", ts);
  appendRegionParamFromListPreserve(sp, formData.get("listRegion"));
  const listDomain = formData.get("listDomain");
  if (typeof listDomain === "string" && listDomain.trim()) {
    sp.set("domain", listDomain.trim());
  }
  const listStatus = formData.get("listStatus");
  if (listStatus === "active" || listStatus === "all" || listStatus === "archived") {
    sp.set("status", listStatus);
  }
}
