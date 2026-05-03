import type { ExerciseLoadType } from "@/modules/lfk-exercises/types";
import {
  applyDoctorCatalogPubArchToSearchParams,
  type DoctorCatalogPubArchQuery,
} from "@/shared/lib/doctorCatalogListStatus";

const LOAD_VALUES: ExerciseLoadType[] = ["strength", "stretch", "balance", "cardio", "other"];
const ARCH_VALUES = ["active", "archived"] as const;
const PUB_VALUES = ["all", "draft", "published"] as const;

export type LfkTemplatesListPreserveInput = {
  q: string;
  regionRefId?: string;
  loadType?: ExerciseLoadType;
  listPubArch: DoctorCatalogPubArchQuery;
  /** Текущая сортировка в UI (может отличаться от URL до применения фильтров). */
  titleSort: "asc" | "desc" | null;
};

/** Строка query без ведущего `?` для редиректа на `/app/doctor/lfk-templates`. */
export function buildLfkTemplatesListPreserveQuery(input: LfkTemplatesListPreserveInput): string {
  const p = new URLSearchParams();
  const qt = input.q.trim();
  if (qt) p.set("q", qt);
  const region = input.regionRefId?.trim();
  if (region) p.set("regionRefId", region);
  if (input.loadType) p.set("loadType", input.loadType);
  applyDoctorCatalogPubArchToSearchParams(p, input.listPubArch);
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

  const region = sp.get("regionRefId")?.trim();
  if (region && region.length <= 120 && !/[\s<>"']/.test(region)) out.set("regionRefId", region);

  const load = sp.get("loadType");
  if (load && (LOAD_VALUES as readonly string[]).includes(load)) out.set("loadType", load);

  const titleSort = sp.get("titleSort");
  if (titleSort === "asc" || titleSort === "desc") out.set("titleSort", titleSort);

  const arch = sp.get("arch");
  if (arch && (ARCH_VALUES as readonly string[]).includes(arch as "active" | "archived")) {
    out.set("arch", arch);
  }

  const pub = sp.get("pub");
  if (pub && (PUB_VALUES as readonly string[]).includes(pub as "all" | "draft" | "published")) {
    out.set("pub", pub);
  }

  const status = sp.get("status");
  if (status && !out.has("arch") && !out.has("pub")) {
    if (status === "archived" || status === "draft" || status === "published" || status === "active") {
      out.set("status", status);
    }
  }

  return out.toString();
}
