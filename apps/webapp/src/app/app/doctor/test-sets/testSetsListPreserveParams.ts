import { appendRegionParamFromListPreserve } from "@/shared/lib/doctorCatalogClientUrlSync";

/** Сборка query после inline save/archive/unarchive набора тестов (без `load` — в каталоге нет фильтра нагрузки). */
export function appendTestSetsListPreserveToSearchParams(sp: URLSearchParams, formData: FormData): void {
  const q = formData.get("listQ");
  if (typeof q === "string" && q.trim()) sp.set("q", q.trim());
  const ts = formData.get("listTitleSort");
  if (ts === "asc" || ts === "desc") sp.set("titleSort", ts);
  appendRegionParamFromListPreserve(sp, formData.get("listRegion"));
  sp.delete("status");
  const listArch = formData.get("listArch");
  if (listArch === "archived") sp.set("arch", "archived");
  else sp.delete("arch");
  const listPub = formData.get("listPub");
  if (listPub === "draft" || listPub === "published") sp.set("pub", listPub);
  else sp.delete("pub");
}
