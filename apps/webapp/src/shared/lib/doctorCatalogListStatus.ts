import type { RecommendationArchiveScope } from "@/modules/recommendations/types";
import type { TestSetArchiveScope } from "@/modules/tests/types";

/** Единый фильтр архивности doctor-каталогов: рабочие или архив (`all` оставлен для старых внутренних вызовов). */
export type DoctorCatalogListStatus = "all" | "active" | "archived";

export const DOCTOR_CATALOG_TEMPLATE_STATUS_FILTER_OPTIONS: {
  value: DoctorCatalogListStatus;
  label: string;
}[] = [
  { value: "active", label: "Активные" },
  { value: "archived", label: "Архив" },
];

/**
 * Парсинг `status` (+ legacy `scope`) для каталогов с архивом.
 * Legacy `all` / `draft` / `published` / `working` из старых ссылок считаются рабочими.
 */
export function parseDoctorCatalogListStatus(
  sp: { status?: string; scope?: string },
  whenMissing: DoctorCatalogListStatus,
): DoctorCatalogListStatus {
  if (typeof sp.status === "string") {
    const st = sp.status.trim();
    if (st === "") return whenMissing;
    if (st === "all") return "active";
    if (st === "archived") return "archived";
    if (st === "active" || st === "draft" || st === "published" || st === "working") return "active";
  }

  const leg = typeof sp.scope === "string" ? sp.scope.trim() : "";
  if (leg === "all") return "active";
  if (leg === "archived") return "archived";
  if (leg === "active") return "active";

  return whenMissing;
}

export function recommendationArchiveScopeFromCatalogStatus(
  s: DoctorCatalogListStatus,
): RecommendationArchiveScope {
  if (s === "all") return "all";
  if (s === "archived") return "archived";
  return "active";
}

/** Фильтр списка рекомендаций и других каталогов с архивом. */
export type RecommendationListFilterScope = DoctorCatalogListStatus;

export const RECOMMENDATION_LIST_FILTER_OPTIONS: {
  value: RecommendationListFilterScope;
  label: string;
}[] = [
  { value: "active", label: "Активные" },
  { value: "archived", label: "Архив" },
];

/**
 * Парсинг `status` для рекомендаций: `active` = не в архиве; legacy `all`/`published`/`draft` из старых ссылок → active.
 */
export function parseRecommendationListFilterScope(
  sp: { status?: string; scope?: string },
  whenMissing: RecommendationListFilterScope = "active",
): RecommendationListFilterScope {
  if (typeof sp.status === "string") {
    const st = sp.status.trim();
    if (st === "") return whenMissing;
    if (st === "all") return "active";
    if (st === "archived") return "archived";
    if (st === "active") return "active";
    if (st === "published" || st === "draft") return "active";
  }
  const leg = typeof sp.scope === "string" ? sp.scope.trim() : "";
  if (leg === "all") return "active";
  if (leg === "archived") return "archived";
  if (leg === "active") return "active";
  return whenMissing;
}

export function recommendationArchiveScopeFromListScope(
  s: RecommendationListFilterScope,
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

/** GET `status` = active|archived (как рекомендации) → фильтр `is_archived` для клинических тестов. */
export function clinicalTestListArchiveScopeFromRecommendationFilter(
  s: RecommendationListFilterScope,
): TestSetArchiveScope {
  if (s === "all") return "all";
  if (s === "archived") return "archived";
  return "active";
}

/** Для шаблонов программ, комплексов ЛФК и курсов в UI оставляем только архивность. */
export type TemplateCourseCatalogListStatus = RecommendationListFilterScope;

export const TEMPLATE_COURSE_CATALOG_LIST_STATUS_OPTIONS: {
  value: TemplateCourseCatalogListStatus;
  label: string;
}[] = [
  ...RECOMMENDATION_LIST_FILTER_OPTIONS,
];

export function parseTemplateCourseCatalogListStatus(
  sp: { status?: string },
  whenMissing: TemplateCourseCatalogListStatus = "active",
): TemplateCourseCatalogListStatus {
  if (typeof sp.status !== "string" || !sp.status.trim()) return whenMissing;
  const st = sp.status.trim();
  if (st === "all") return "active";
  if (st === "active" || st === "archived") {
    return st;
  }
  if (st === "working" || st === "draft" || st === "published") return "active";
  return whenMissing;
}

/** Фильтр для `listTemplates` и `courses.listForDoctor`: в UI это только архивность. */
export function serverListFilterFromTemplateCourseCatalogStatus(s: TemplateCourseCatalogListStatus): {
  includeArchived: boolean;
  status?: "draft" | "published" | "archived";
} {
  if (s === "active") return { includeArchived: false };
  if (s === "all") return { includeArchived: true };
  if (s === "archived") return { includeArchived: true, status: "archived" };
  return { includeArchived: false };
}
