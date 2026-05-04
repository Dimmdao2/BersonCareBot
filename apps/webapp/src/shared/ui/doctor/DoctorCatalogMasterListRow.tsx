"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type DoctorCatalogMasterListRowProps = {
  active: boolean;
  onPick: () => void;
  /** Содержимое полосы превью (30×30), без внешней обёртки — добавляется внутри `flex min-h-[30px] …`. */
  previewInner: ReactNode;
  title: string;
  /** Вторая строка под заголовком (счётчики и т.п.). */
  meta: ReactNode;
  /** Правая колонка: бейдж Черновик / Опубликован / В архиве. */
  badge: ReactNode;
};

/**
 * Строка master-списка каталога врача: как в «Комплексы ЛФК» — превью-сетка слева в кнопке,
 * заголовок + мета, отдельная колонка с бейджем статуса.
 */
export function DoctorCatalogMasterListRow({
  active,
  onPick,
  previewInner,
  title,
  meta,
  badge,
}: DoctorCatalogMasterListRowProps) {
  return (
    <li className="rounded-md border border-border/40 bg-card/30">
      <div className="flex w-full items-stretch gap-0">
        <button
          type="button"
          onClick={onPick}
          className={cn(
            "flex min-w-0 flex-1 items-center gap-2 rounded-md border border-transparent px-2 py-2 text-left text-sm hover:bg-muted/80",
            active &&
              "border-primary/25 bg-primary/15 text-primary hover:bg-primary/20 dark:bg-primary/20 dark:hover:bg-primary/25",
          )}
        >
          <div className="flex min-h-[30px] flex-wrap content-end items-end gap-1">{previewInner}</div>
          <div className="min-w-0 flex-1">
            <div className="line-clamp-2 font-medium leading-tight">{title}</div>
            <div
              className={cn(
                "text-xs tabular-nums",
                active ? "text-primary/70" : "text-muted-foreground",
              )}
            >
              {meta}
            </div>
          </div>
        </button>
        <div
          className="flex w-[6.75rem] shrink-0 flex-col items-stretch justify-center border-l border-border/40 bg-background/50 px-1 py-1"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {badge}
        </div>
      </div>
    </li>
  );
}
