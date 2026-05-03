import { appendRegionParamFromListPreserve } from "@/shared/lib/doctorCatalogClientUrlSync";
import type { RecommendationListFilterScope } from "@/shared/lib/doctorCatalogListStatus";

/** Собрать query каталога рекомендаций из среза preserve (редирект после standalone save/archive). */
export function appendRecommendationsCatalogFiltersToSearchParams(
  sp: URLSearchParams,
  p: {
    q?: string;
    titleSort?: "asc" | "desc" | null;
    regionCode?: string;
    domain?: string;
    listStatus?: RecommendationListFilterScope;
  },
): void {
  if (p.q?.trim()) sp.set("q", p.q.trim());
  if (p.titleSort === "asc" || p.titleSort === "desc") sp.set("titleSort", p.titleSort);
  appendRegionParamFromListPreserve(sp, p.regionCode?.trim() ?? null);
  if (p.domain?.trim()) sp.set("domain", p.domain.trim());
  if (p.listStatus === "active" || p.listStatus === "all" || p.listStatus === "archived") {
    sp.set("status", p.listStatus);
  }
}

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
