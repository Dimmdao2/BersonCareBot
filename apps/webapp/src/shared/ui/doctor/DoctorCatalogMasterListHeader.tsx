"use client";

import { LayoutGrid, List } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DoctorCatalogArchiveScopeSelect } from "@/shared/ui/doctor/DoctorCatalogArchiveScopeSelect";
import { DoctorCatalogTitleSortSelect } from "@/shared/ui/doctor/DoctorCatalogTitleSortSelect";
import type { RecommendationListFilterScope } from "@/shared/lib/doctorCatalogListStatus";
import { cn } from "@/lib/utils";

export type CatalogMasterTitleSort = "asc" | "desc";

export type DoctorCatalogMasterListHeaderProps = {
  /** Одна строка под счётчик: «Нет …» или «…: N». */
  summaryLine: string;
  viewMode: "tiles" | "list";
  onToggleView: () => void;
  titleSort: CatalogMasterTitleSort | null;
  onTitleSortChange: (next: CatalogMasterTitleSort | null) => void;
  listBusy?: boolean;
  archiveScope?: RecommendationListFilterScope;
  archiveScopeExtraParams?: Record<string, string | null | undefined>;
};

/** Шапка левой колонки master-detail: сортировка по названию + счётчик + переключатель список/плитки. */
export function DoctorCatalogMasterListHeader({
  summaryLine,
  viewMode,
  onToggleView,
  titleSort,
  onTitleSortChange,
  listBusy = false,
  archiveScope,
  archiveScopeExtraParams,
}: DoctorCatalogMasterListHeaderProps) {
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
        {archiveScope ? (
          <DoctorCatalogArchiveScopeSelect value={archiveScope} extraParams={archiveScopeExtraParams} />
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2 sm:justify-end">
        <p className="min-w-0 truncate text-xs text-muted-foreground">{summaryLine}</p>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className={cn("box-border size-[32px] shrink-0 transition-opacity", listBusy && "opacity-70")}
          aria-label={viewMode === "tiles" ? "Показать список" : "Показать плитки"}
          title={viewMode === "tiles" ? "Список" : "Плитки"}
          onClick={onToggleView}
          aria-busy={listBusy}
        >
          {viewMode === "tiles" ? <LayoutGrid className="size-4" aria-hidden /> : <List className="size-4" aria-hidden />}
        </Button>
      </div>
    </div>
  );
}
