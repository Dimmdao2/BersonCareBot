"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type CatalogRightPaneProps = {
  children: ReactNode;
  className?: string;
  /** Дополнительные классы для области прокрутки (по умолчанию паддинги 24px по горизонтали, py-4). */
  contentClassName?: string;
};

/**
 * Правая колонка каталогов врача (master-detail): один фон `bg-card`, без составного обрамления —
 * без `Card`/`ring`/лишней `border`/`shadow`, чтобы не дублировать контур левой колонки и сетки.
 * Использовать парой с `CatalogLeftPane` и `CatalogSplitLayout`.
 */
export function CatalogRightPane({ children, className, contentClassName }: CatalogRightPaneProps) {
  return (
    <div
      className={cn(
        "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl bg-card lg:overflow-visible",
        className,
      )}
    >
      <div
        className={cn(
          "flex min-h-0 flex-1 flex-col overflow-y-auto px-6 py-4",
          contentClassName,
        )}
      >
        {children}
      </div>
    </div>
  );
}
