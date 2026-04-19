import { useMemo } from "react";
import { normalizeRuSearchString } from "@/shared/lib/ruSearchNormalize";
import type { TitleSortValue } from "@/shared/ui/doctor/DoctorCatalogTitleSortSelect";

type WithTitle = { title: string };

/**
 * Клиентская фильтрация по названию и опциональная сортировка А→Я / Я→А для каталогов doctor CMS.
 * Полный список приходит с сервера (RSC); строка поиска не дергает API.
 */
export function useDoctorCatalogDisplayList<T extends WithTitle>(
  items: T[],
  searchQuery: string,
  titleSort: TitleSortValue,
): T[] {
  return useMemo(() => {
    let out = items;
    const needle = normalizeRuSearchString(searchQuery.trim());
    if (needle) {
      out = out.filter((x) => normalizeRuSearchString(x.title).includes(needle));
    }
    if (titleSort === "asc" || titleSort === "desc") {
      out = [...out].sort((a, b) => {
        const cmp = a.title.localeCompare(b.title, "ru", { sensitivity: "base" });
        return titleSort === "asc" ? cmp : -cmp;
      });
    }
    return out;
  }, [items, searchQuery, titleSort]);
}
