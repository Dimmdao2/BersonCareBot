import type { RecommendationArchiveScope } from "@/modules/recommendations/types";
import type { TemplateFilter, TemplateStatus } from "@/modules/lfk-templates/types";
import type { TreatmentProgramTemplateFilter } from "@/modules/treatment-program/types";
import type { TestSetArchiveScope, TestSetFilter, TestSetPublicationScope } from "@/modules/tests/types";

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

// ——— Публикация × архив (B1): `?arch=` + `?pub=` + legacy `status=` ———

/** Ось архива в каталогах с публикацией (два значения в UI). */
export type DoctorCatalogArchiveAxis = "active" | "archived";

/** Ось публикации в каталогах с публикацией. */
export type DoctorCatalogPublicationFilter = "all" | "draft" | "published";

export type DoctorCatalogPubArchQuery = {
  arch: DoctorCatalogArchiveAxis;
  pub: DoctorCatalogPublicationFilter;
};

export type DoctorCatalogPubArchSearchParams = {
  arch?: string;
  pub?: string;
  status?: string;
  scope?: string;
};

/**
 * Две независимые оси из query: `arch` × `pub`.
 * Legacy `status=archived|active|draft|published|…` и `scope=` — см. ТЗ B1.
 */
export function parseDoctorCatalogPubArchQuery(
  sp: DoctorCatalogPubArchSearchParams,
  defaults: DoctorCatalogPubArchQuery = { arch: "active", pub: "all" },
): DoctorCatalogPubArchQuery {
  const archParam = typeof sp.arch === "string" ? sp.arch.trim() : "";
  const status = typeof sp.status === "string" ? sp.status.trim() : "";
  const scope = typeof sp.scope === "string" ? sp.scope.trim() : "";

  let arch: DoctorCatalogArchiveAxis = defaults.arch;
  if (archParam === "archived") arch = "archived";
  else if (archParam === "active") arch = "active";
  else if (status === "archived" || scope === "archived") arch = "archived";
  else arch = "active";

  let pub: DoctorCatalogPublicationFilter = defaults.pub;
  const pubParam = typeof sp.pub === "string" ? sp.pub.trim() : "";
  if (pubParam === "draft" || pubParam === "published" || pubParam === "all") {
    pub = pubParam;
  } else if (arch !== "archived") {
    if (status === "draft") pub = "draft";
    else if (status === "published") pub = "published";
  }

  return { arch, pub };
}

/** Явные `?arch=` / `?pub=` с недопустимым значением (пустая строка — не ошибка). */
export function explicitDoctorCatalogPubArchParamsInvalid(
  sp: Pick<DoctorCatalogPubArchSearchParams, "arch" | "pub">,
): boolean {
  const a = typeof sp.arch === "string" ? sp.arch.trim() : "";
  const p = typeof sp.pub === "string" ? sp.pub.trim() : "";
  if (a !== "" && a !== "active" && a !== "archived") return true;
  if (p !== "" && p !== "all" && p !== "draft" && p !== "published") return true;
  return false;
}

/** Записать оси `arch`/`pub` в {@link URLSearchParams}; удалить legacy `status`. */
export function applyDoctorCatalogPubArchToSearchParams(p: URLSearchParams, q: DoctorCatalogPubArchQuery): void {
  p.delete("status");
  if (q.arch === "archived") p.set("arch", "archived");
  else p.delete("arch");
  if (q.pub === "draft" || q.pub === "published") p.set("pub", q.pub);
  else p.delete("pub");
}

export function lfkTemplateFilterFromPubArch(q: DoctorCatalogPubArchQuery): TemplateFilter {
  if (q.arch === "archived") return { status: "archived" };
  if (q.pub === "draft") return { status: "draft" };
  if (q.pub === "published") return { status: "published" };
  return { statusIn: ["draft", "published"] as TemplateStatus[] };
}

export function treatmentProgramTemplateFilterFromPubArch(
  q: DoctorCatalogPubArchQuery,
): TreatmentProgramTemplateFilter {
  if (q.arch === "archived") return { includeArchived: true, status: "archived" };
  if (q.pub === "draft") return { includeArchived: false, status: "draft" };
  if (q.pub === "published") return { includeArchived: false, status: "published" };
  return { includeArchived: false };
}

function testSetArchiveScopeFromAxis(arch: DoctorCatalogArchiveAxis): TestSetArchiveScope {
  if (arch === "archived") return "archived";
  return "active";
}

export function testSetListFilterFromPubArch(q: DoctorCatalogPubArchQuery): TestSetFilter {
  return {
    archiveScope: testSetArchiveScopeFromAxis(q.arch),
    publicationScope: q.pub,
    search: null,
  };
}

/**
 * Список наборов для `GET /api/doctor/test-sets` (совместимость с `includeArchived` + новые `arch` / `publicationScope`).
 */
export function testSetListFilterFromDoctorApiGetQuery(sp: {
  q?: string | undefined;
  /** @deprecated Используйте {@link arch}. */
  includeArchived?: boolean | undefined;
  arch?: "active" | "archived" | undefined;
  publicationScope?: TestSetPublicationScope | undefined;
}): TestSetFilter {
  let archiveScope: TestSetArchiveScope = "active";
  if (sp.arch === "archived") archiveScope = "archived";
  else if (sp.includeArchived === true) archiveScope = "all";

  const qv = typeof sp.q === "string" ? sp.q.trim() : "";
  return {
    search: qv.length > 0 ? qv : null,
    archiveScope,
    publicationScope: sp.publicationScope ?? "all",
  };
}
