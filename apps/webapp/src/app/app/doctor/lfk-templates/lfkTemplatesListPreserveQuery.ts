import type { ExerciseLoadType } from "@/modules/lfk-exercises/types";
import type { RecommendationListFilterScope } from "@/shared/lib/doctorCatalogListStatus";

const LOAD_VALUES: ExerciseLoadType[] = ["strength", "stretch", "balance", "cardio", "other"];
const STATUS_VALUES: RecommendationListFilterScope[] = ["active", "all", "archived"];

export type LfkTemplatesListPreserveInput = {
  q: string;
  regionRefId?: string;
  loadType?: ExerciseLoadType;
  listStatus?: RecommendationListFilterScope;
  /** Текущая сортировка в UI (может отличаться от URL до применения фильтров). */
  titleSort: "asc" | "desc" | null;
};

/** Строка query без ведущего `?` для редиректа на `/app/doctor/lfk-templates`. */
export function buildLfkTemplatesListPreserveQuery(input: LfkTemplatesListPreserveInput): string {
  const p = new URLSearchParams();
  const qt = input.q.trim();
  if (qt) p.set("q", qt);
  const region = input.regionRefId?.trim();
  if (region) p.set("region", region);
  if (input.loadType) p.set("load", input.loadType);
  if (input.listStatus && input.listStatus !== "active") p.set("status", input.listStatus);
  if (input.titleSort === "asc" || input.titleSort === "desc") p.set("titleSort", input.titleSort);
  return p.toString();
}

/**
 * Оставляет только допустимые ключи каталога комплексов ЛФК (защита от подстановки в hidden при архивации).
 */
export function sanitizeLfkTemplatesListPreserveQuery(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  let sp: URLSearchParams;
  try {
    sp = new URLSearchParams(trimmed.startsWith("?") ? trimmed.slice(1) : trimmed);
  } catch {
    return "";
  }
  const out = new URLSearchParams();
  const q = sp.get("q");
  if (q != null && q.length <= 500) out.set("q", q);

  const region = sp.get("region")?.trim();
  if (region && region.length <= 120 && !/[\s<>"']/.test(region)) out.set("region", region);

  const load = sp.get("load");
  if (load && (LOAD_VALUES as readonly string[]).includes(load)) out.set("load", load);

  const titleSort = sp.get("titleSort");
  if (titleSort === "asc" || titleSort === "desc") out.set("titleSort", titleSort);

  const status = sp.get("status");
  if (status && (STATUS_VALUES as readonly string[]).includes(status)) out.set("status", status);

  return out.toString();
}
