import type { ExerciseLoadType } from "@/modules/lfk-exercises/types";
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
  invalidRegionQuery: boolean;
  loadType?: ExerciseLoadType;
  titleSort: "asc" | "desc" | null;
  /** Рекомендации: `domain` из query. */
  domain?: string;
  /** Клинические тесты: `assessment` из query. */
  assessmentKind?: string;
};

export function readDoctorCatalogClientFilterUrlSlice(): DoctorCatalogClientFilterUrlSlice {
  if (typeof window === "undefined") {
    return { q: "", invalidRegionQuery: false, titleSort: null };
  }
  const sp = new URLSearchParams(window.location.search);
  const q = sp.get("q") ?? "";
  const regionParsed = parseDoctorCatalogRegionQueryParam(sp.get("region") ?? undefined);
  const load = sp.get("load");
  const loadType =
    load === "strength" || load === "stretch" || load === "balance" || load === "cardio" || load === "other"
      ? (load as ExerciseLoadType)
      : undefined;
  const ts = sp.get("titleSort");
  const titleSort = ts === "asc" || ts === "desc" ? ts : null;
  const domainRaw = sp.get("domain");
  const domain = typeof domainRaw === "string" && domainRaw.trim() ? domainRaw.trim() : undefined;
  const assessmentRaw = sp.get("assessment");
  const assessmentKind =
    typeof assessmentRaw === "string" && assessmentRaw.trim() ? assessmentRaw.trim() : undefined;
  return {
    q,
    regionCode: regionParsed.regionCode,
    invalidRegionQuery: regionParsed.invalidRegionQuery,
    loadType,
    titleSort,
    domain,
    assessmentKind,
  };
}

/**
 * Добавить `region` в redirect только если это не UUID (контракт каталога).
 * Использовать в server actions preserve (`listRegion` → `region`).
 */
export function appendRegionParamFromListPreserve(sp: URLSearchParams, listRegion: FormDataEntryValue | null): void {
  const raw = typeof listRegion === "string" ? listRegion.trim() : "";
  if (!raw) return;
  const p = parseDoctorCatalogRegionQueryParam(raw);
  if (p.invalidRegionQuery || !p.regionCode) return;
  sp.set("region", p.regionCode);
}
