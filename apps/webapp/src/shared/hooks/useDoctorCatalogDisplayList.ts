import { useMemo } from "react";
import type { ExerciseLoadType } from "@/modules/lfk-exercises/types";
import { normalizeRuSearchString } from "@/shared/lib/ruSearchNormalize";
import type { TitleSortValue } from "@/shared/ui/doctor/DoctorCatalogTitleSortSelect";

type WithTitle = { title: string };

export type DoctorCatalogDisplayListOptions<T> = {
  regionCode?: string | null;
  loadType?: ExerciseLoadType | null;
  getItemRegionCode?: (item: T) => string | null;
  getItemLoadType?: (item: T) => ExerciseLoadType | null;
  /** Доп. фильтр по коду (напр. `domain` у рекомендаций, `assessmentKind` у клин. тестов). */
  tertiaryCode?: string | null;
  getItemTertiaryCode?: (item: T) => string | null;
};

/**
 * Клиентская фильтрация каталогов врача: поиск по названию, опционально регион (код) и тип нагрузки,
 * сортировка А→Я / Я→А. Полный список приходит с сервера без `q`/`region`/`load` в list-запросе.
 */
export function useDoctorCatalogDisplayList<T extends WithTitle>(
  items: T[],
  searchQuery: string,
  titleSort: TitleSortValue,
  options?: DoctorCatalogDisplayListOptions<T>,
): T[] {
  const regionCode = options?.regionCode?.trim() ?? "";
  const loadType = options?.loadType ?? null;
  const tertiaryCode = options?.tertiaryCode?.trim() ?? "";
  const getItemRegionCode = options?.getItemRegionCode;
  const getItemLoadType = options?.getItemLoadType;
  const getItemTertiaryCode = options?.getItemTertiaryCode;

  return useMemo(() => {
    let out = items;
    const needle = normalizeRuSearchString(searchQuery.trim());
    if (needle) {
      out = out.filter((x) => normalizeRuSearchString(x.title).includes(needle));
    }

    if (regionCode && getItemRegionCode) {
      out = out.filter((x) => getItemRegionCode(x) === regionCode);
    }

    if (loadType && getItemLoadType) {
      out = out.filter((x) => getItemLoadType(x) === loadType);
    }

    if (tertiaryCode && getItemTertiaryCode) {
      out = out.filter((x) => getItemTertiaryCode(x) === tertiaryCode);
    }

    if (titleSort === "asc" || titleSort === "desc") {
      out = [...out].sort((a, b) => {
        const cmp = a.title.localeCompare(b.title, "ru", { sensitivity: "base" });
        return titleSort === "asc" ? cmp : -cmp;
      });
    }
    return out;
  }, [
    items,
    searchQuery,
    titleSort,
    regionCode,
    loadType,
    tertiaryCode,
    getItemRegionCode,
    getItemLoadType,
    getItemTertiaryCode,
  ]);
}
