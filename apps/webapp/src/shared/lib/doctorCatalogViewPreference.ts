export type DoctorCatalogViewMode = "tiles" | "list";

const PREFIX = "bersoncare.doctorCatalogView.";

/** Ключи localStorage — по одному на страницу каталога. */
export const doctorCatalogViewStorageKey = {
  exercises: `${PREFIX}exercises`,
  clinicalTests: `${PREFIX}clinical-tests`,
  recommendations: `${PREFIX}recommendations`,
} as const;

export function readDoctorCatalogViewPreference(storageKey: string): DoctorCatalogViewMode | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (raw === "list" || raw === "tiles") return raw;
    return null;
  } catch {
    return null;
  }
}

export function writeDoctorCatalogViewPreference(storageKey: string, mode: DoctorCatalogViewMode): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey, mode);
  } catch {
    /* quota / private mode */
  }
}

/**
 * Разбор `?view=` из URL: явный параметр блокирует подстановку из localStorage.
 */
export function doctorCatalogViewFromSearchParams(viewRaw: string | undefined): {
  initialViewMode: DoctorCatalogViewMode;
  viewLockedByUrl: boolean;
} {
  const raw = typeof viewRaw === "string" ? viewRaw.trim().toLowerCase() : "";
  const viewLockedByUrl = raw === "list" || raw === "tiles";
  const initialViewMode: DoctorCatalogViewMode = raw === "list" ? "list" : "tiles";
  return { initialViewMode, viewLockedByUrl };
}
