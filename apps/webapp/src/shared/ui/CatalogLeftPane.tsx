"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  DOCTOR_CATALOG_LEFT_ASIDE_STICKY_LAYOUT_CLASS,
  DOCTOR_CATALOG_LEFT_ASIDE_STICKY_LAYOUT_DOUBLE_ROW_CLASS,
} from "@/shared/ui/doctorWorkspaceLayout";

export type CatalogLeftPaneProps = {
  /** Тулбар над списком (счётчик, сортировка, переключатель видов). */
  headerSlot?: ReactNode;
  children: ReactNode;
  /**
   * Если true — левая колонка фиксируется под шапкой с учётом липкого блока фильтров страницы.
   * Если false — как простой блок в сетке (без доп. sticky-высоты).
   */
  stickySplit?: boolean;
  /**
   * Высота учёта липкой полосы над сеткой: один ряд (~3.25rem) или два (~6.5rem), см. константы в doctorWorkspaceLayout.
   */
  stickyToolbarRows?: 1 | 2;
  className?: string;
};

/** Левая колонка master-detail: рамка, скролл, опционально sticky под шапкой доктора. */
export function CatalogLeftPane({
  headerSlot,
  children,
  stickySplit = true,
  stickyToolbarRows = 1,
  className,
}: CatalogLeftPaneProps) {
  const stickyAsideClass =
    stickyToolbarRows === 2
      ? DOCTOR_CATALOG_LEFT_ASIDE_STICKY_LAYOUT_DOUBLE_ROW_CLASS
      : DOCTOR_CATALOG_LEFT_ASIDE_STICKY_LAYOUT_CLASS;

  return (
    <aside
      className={cn(
        "flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card",
        stickySplit && stickyAsideClass,
        className,
      )}
    >
      {headerSlot ? <div className="shrink-0 px-2 pb-1.5 pt-2">{headerSlot}</div> : null}
      <div
        className={cn(
          "min-h-0 flex flex-1 flex-col overflow-hidden",
          headerSlot ? "px-2 pb-2 pt-1.5" : "overflow-y-auto p-2 pt-2",
        )}
      >
        {children}
      </div>
    </aside>
  );
}
