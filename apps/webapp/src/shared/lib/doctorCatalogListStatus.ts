import type { RecommendationArchiveScope } from "@/modules/recommendations/types";
import type { TestSetArchiveScope } from "@/modules/tests/types";

/** Как у комплексов ЛФК: `all` = все, остальное — те же значения, что `status` в URL. */
export type DoctorCatalogListStatus = "all" | "draft" | "published" | "archived";

export const DOCTOR_CATALOG_TEMPLATE_STATUS_FILTER_OPTIONS: {
  value: DoctorCatalogListStatus;
  label: string;
}[] = [
  { value: "all", label: "Все" },
  { value: "draft", label: "Черновики" },
  { value: "published", label: "Опубликованные" },
  { value: "archived", label: "Архив" },
];

/**
 * Парсинг `status` (+ legacy `scope`) для каталогов без отдельных полей черновик/опубликован в БД:
 * `draft` и `published` дают выборку «не в архиве», как раньше «активные».
 */
export function parseDoctorCatalogListStatus(
  sp: { status?: string; scope?: string },
  whenMissing: DoctorCatalogListStatus,
): DoctorCatalogListStatus {
  if (typeof sp.status === "string") {
    const st = sp.status.trim();
    if (st === "all" || st === "") return "all";
    if (st === "draft" || st === "published" || st === "archived") return st;
  }

  const leg = typeof sp.scope === "string" ? sp.scope.trim() : "";
  if (leg === "all") return "all";
  if (leg === "archived") return "archived";
  if (leg === "active") return "published";

  return whenMissing;
}

export function recommendationArchiveScopeFromCatalogStatus(
  s: DoctorCatalogListStatus,
): RecommendationArchiveScope {
  if (s === "all") return "all";
  if (s === "archived") return "archived";
  return "active";
}

export function testSetArchiveScopeFromCatalogStatus(s: DoctorCatalogListStatus): TestSetArchiveScope {
  if (s === "all") return "all";
  if (s === "archived") return "archived";
  return "active";
}
