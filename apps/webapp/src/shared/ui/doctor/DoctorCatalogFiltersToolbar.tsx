"use client";

import type { ReactNode } from "react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DoctorCatalogStickyToolbar } from "@/shared/ui/doctor/DoctorCatalogStickyToolbar";
import { DoctorCatalogToolbarMainRow } from "@/shared/ui/doctor/DoctorCatalogToolbarLayout";

export const doctorCatalogToolbarPrimaryActionClassName = cn(
  buttonVariants({ size: "sm" }),
  "box-border h-[32px] min-h-[32px] inline-flex shrink-0 gap-1 px-3 py-1 text-sm leading-5 text-center",
);

export type DoctorCatalogFiltersToolbarProps = {
  filters: ReactNode;
  end?: ReactNode;
  className?: string;
};

/** Липкий тулбар каталога врача: слева фильтры, справа основное действие («Создать» и т.п.). */
export function DoctorCatalogFiltersToolbar({ filters, end, className }: DoctorCatalogFiltersToolbarProps) {
  return (
    <DoctorCatalogStickyToolbar className={className}>
      <DoctorCatalogToolbarMainRow start={filters} end={end} />
    </DoctorCatalogStickyToolbar>
  );
}
