"use client";

import type { DoctorCatalogPubArchQuery, RecommendationListFilterScope } from "@/shared/lib/doctorCatalogListStatus";
import type { CatalogMasterTitleSort } from "@/shared/ui/doctor/DoctorCatalogMasterListHeader";
import { CatalogStatusFilters } from "@/shared/ui/doctor/CatalogStatusFilters";
import { DoctorCatalogArchiveScopeSelect } from "@/shared/ui/doctor/DoctorCatalogArchiveScopeSelect";
import { DoctorCatalogTitleSortSelect } from "@/shared/ui/doctor/DoctorCatalogTitleSortSelect";

export type DoctorCatalogListSortHeaderProps = {
  summaryLine: string;
  titleSort: CatalogMasterTitleSort | null;
  onTitleSortChange: (next: CatalogMasterTitleSort | null) => void;
  /** Каталоги только с архивом (рекомендации, клин. тесты, …). */
  archiveScope?: RecommendationListFilterScope;
  /** ЛФК / шаблоны программ / наборы тестов: архив × публикация. */
  catalogPubArch?: DoctorCatalogPubArchQuery;
  archiveScopeExtraParams?: Record<string, string | null | undefined>;
};

/** Левая шапка каталога без переключателя «список/плитка»: сортировка (~160px) + счётчик. */
export function DoctorCatalogListSortHeader({
  summaryLine,
  titleSort,
  onTitleSortChange,
  archiveScope,
  catalogPubArch,
  archiveScopeExtraParams,
}: DoctorCatalogListSortHeaderProps) {
  return (
    <div className="flex flex-col gap-2 border-b border-border/60 pb-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <DoctorCatalogTitleSortSelect
          value={titleSort ?? "default"}
          onValueChange={(v) => {
            if (v === "default") onTitleSortChange(null);
            else onTitleSortChange(v as CatalogMasterTitleSort);
          }}
        />
        {catalogPubArch ? (
          <CatalogStatusFilters value={catalogPubArch} extraParams={archiveScopeExtraParams} />
        ) : archiveScope ? (
          <DoctorCatalogArchiveScopeSelect value={archiveScope} extraParams={archiveScopeExtraParams} />
        ) : null}
      </div>
      <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground sm:text-end">{summaryLine}</p>
    </div>
  );
}
