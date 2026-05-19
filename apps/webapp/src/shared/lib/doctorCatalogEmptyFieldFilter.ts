/**
 * Зарезервированное значение query (`region`, `load`, `domain`, `assessment` и т.д.):
 * показывать только элементы каталога с **незаполненным** соответствующим полем.
 * Совместимо с контрактом кода региона `[a-z0-9_]+`.
 */
export const DOCTOR_CATALOG_FILTER_MISSING = "__missing__" as const;

export type DoctorCatalogMissingFilter = typeof DOCTOR_CATALOG_FILTER_MISSING;

export function isDoctorCatalogMissingFilter(
  value: string | null | undefined,
): value is DoctorCatalogMissingFilter {
  return value === DOCTOR_CATALOG_FILTER_MISSING;
}

export function isDoctorCatalogMissingFilterToken(raw: string | undefined): boolean {
  return typeof raw === "string" && raw.trim() === DOCTOR_CATALOG_FILTER_MISSING;
}
