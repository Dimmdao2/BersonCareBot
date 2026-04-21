"use client";

import { DoctorCatalogTitleSortSelect } from "@/shared/ui/doctor/DoctorCatalogTitleSortSelect";
import type { CatalogMasterTitleSort } from "@/shared/ui/doctor/DoctorCatalogMasterListHeader";

export type DoctorCatalogListSortHeaderProps = {
  summaryLine: string;
  titleSort: CatalogMasterTitleSort | null;
  onTitleSortChange: (next: CatalogMasterTitleSort | null) => void;
};

/** Левая шапка каталога без переключателя «список/плитка»: сортировка (~160px) + счётчик. */
export function DoctorCatalogListSortHeader({
  summaryLine,
  titleSort,
  onTitleSortChange,
}: DoctorCatalogListSortHeaderProps) {
  return (
    <div className="flex flex-col gap-2 border-b border-border/60 pb-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-2">
      <DoctorCatalogTitleSortSelect
        value={titleSort ?? "default"}
        onValueChange={(v) => {
          if (v === "default") onTitleSortChange(null);
          else onTitleSortChange(v as CatalogMasterTitleSort);
        }}
        className="w-[160px] max-w-[160px] shrink-0 min-w-0"
        triggerClassName="w-full"
      />
      <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground sm:text-end">{summaryLine}</p>
    </div>
  );
}
