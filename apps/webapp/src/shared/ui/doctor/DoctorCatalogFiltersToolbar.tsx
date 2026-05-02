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

/** Единая горизонтальная строка контролов слева в тулбаре (поиск, статус и т.д.). */
export function DoctorCatalogToolbarFiltersSlot({ children }: { children: ReactNode }) {
  return <div className="flex w-full min-w-0 flex-wrap items-center gap-1.5">{children}</div>;
}

/** Липкий тулбар каталога врача: слева фильтры, справа основное действие («Создать» и т.п.). */
export function DoctorCatalogFiltersToolbar({ filters, end, className }: DoctorCatalogFiltersToolbarProps) {
  return (
    <DoctorCatalogStickyToolbar className={className}>
      <DoctorCatalogToolbarMainRow start={filters} end={end} />
    </DoctorCatalogStickyToolbar>
  );
}

/** Алиас к `DoctorCatalogFiltersToolbar` — один компонент для ЛФК, наборов тестов, шаблонов программ, рекомендаций. */
export const DoctorCatalogPageToolbar = DoctorCatalogFiltersToolbar;
