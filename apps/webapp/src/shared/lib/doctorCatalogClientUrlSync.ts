import { parseExerciseLoadCatalogUrlParam } from "@/modules/lfk-exercises/exerciseLoadTypeReference";
import type { ExerciseLoadType } from "@/modules/lfk-exercises/types";
import type { DoctorCatalogMissingFilter } from "@/shared/lib/doctorCatalogEmptyFieldFilter";
import { parseDoctorCatalogRegionQueryParam } from "@/shared/lib/doctorCatalogRegionQuery";

/** Событие после `history.replaceState` для каталогов врача (без `router.replace`). */
export const DOCTOR_CATALOG_URL_SYNC_EVENT = "doctorcatalog:urlsync";

export function dispatchDoctorCatalogUrlSync(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(DOCTOR_CATALOG_URL_SYNC_EVENT));
}

/** Срез query, управляемый только на клиенте (не должен менять server `list*`). */
export type DoctorCatalogClientFilterUrlSlice = {
  q: string;
  regionCode?: string;
  loadType?: ExerciseLoadType | DoctorCatalogMissingFilter;
  titleSort: "asc" | "desc" | null;
  /** Рекомендации: `domain` из query. */
  domain?: string;
  /** Клинические тесты: `assessment` из query. */
  assessmentKind?: string;
  hasRegionParam: boolean;
  hasLoadParam: boolean;
  hasTitleSortParam: boolean;
  hasDomainParam: boolean;
  hasAssessmentParam: boolean;
};

export type DoctorCatalogClientFilterUrlHints = Pick<
  DoctorCatalogClientFilterUrlSlice,
  "hasRegionParam" | "hasLoadParam" | "hasTitleSortParam" | "hasDomainParam" | "hasAssessmentParam"
>;

export function emptyDoctorCatalogClientFilterUrlSlice(): DoctorCatalogClientFilterUrlSlice {
  return {
    q: "",
    titleSort: null,
    hasRegionParam: false,
    hasLoadParam: false,
    hasTitleSortParam: false,
    hasDomainParam: false,
    hasAssessmentParam: false,
  };
}

/** Наличие query-ключей с сервера (SSR/hydration до client URL sync). */
export function doctorCatalogClientFilterUrlHints(searchParams: {
  region?: string;
  load?: string;
  titleSort?: string;
  domain?: string;
  assessment?: string;
}): DoctorCatalogClientFilterUrlHints {
  return {
    hasRegionParam: typeof searchParams.region === "string",
    hasLoadParam: typeof searchParams.load === "string",
    hasTitleSortParam: searchParams.titleSort === "asc" || searchParams.titleSort === "desc",
    hasDomainParam: typeof searchParams.domain === "string" && searchParams.domain.trim() !== "",
    hasAssessmentParam: typeof searchParams.assessment === "string" && searchParams.assessment.trim() !== "",
  };
}

function readDoctorCatalogClientFilterUrlSliceFromSearchParams(
  sp: URLSearchParams,
): DoctorCatalogClientFilterUrlSlice {
  const q = sp.get("q") ?? "";
  const hasRegionParam = sp.has("region");
  const regionParsed = parseDoctorCatalogRegionQueryParam(sp.get("region") ?? undefined);
  const hasLoadParam = sp.has("load");
  const loadType = hasLoadParam ? parseExerciseLoadCatalogUrlParam(sp.get("load")) : undefined;
  const hasTitleSortParam = sp.has("titleSort");
  const ts = sp.get("titleSort");
  const titleSort = ts === "asc" || ts === "desc" ? ts : null;
  const hasDomainParam = sp.has("domain");
  const domainRaw = sp.get("domain");
  const domain = typeof domainRaw === "string" && domainRaw.trim() ? domainRaw.trim() : undefined;
  const hasAssessmentParam = sp.has("assessment");
  const assessmentRaw = sp.get("assessment");
  const assessmentKind =
    typeof assessmentRaw === "string" && assessmentRaw.trim() ? assessmentRaw.trim() : undefined;
  return {
    q,
    regionCode: hasRegionParam ? regionParsed.regionCode : undefined,
    loadType,
    titleSort: hasTitleSortParam ? titleSort : null,
    domain: hasDomainParam ? domain : undefined,
    assessmentKind: hasAssessmentParam ? assessmentKind : undefined,
    hasRegionParam,
    hasLoadParam,
    hasTitleSortParam,
    hasDomainParam,
    hasAssessmentParam,
  };
}

export function readDoctorCatalogClientFilterUrlSlice(): DoctorCatalogClientFilterUrlSlice {
  if (typeof window === "undefined") {
    return emptyDoctorCatalogClientFilterUrlSlice();
  }
  return readDoctorCatalogClientFilterUrlSliceFromSearchParams(
    new URLSearchParams(window.location.search),
  );
}

/**
 * Добавить `region` в redirect только если значение — валидный код региона (контракт каталога).
 * Использовать в server actions preserve (`listRegion` → `region`).
 */
export function appendRegionParamFromListPreserve(sp: URLSearchParams, listRegion: FormDataEntryValue | null): void {
  const raw = typeof listRegion === "string" ? listRegion.trim() : "";
  if (!raw) return;
  const p = parseDoctorCatalogRegionQueryParam(raw);
  if (!p.regionCode) return;
  sp.set("region", p.regionCode);
}
