"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type DoctorCatalogToolbarMainRowProps = {
  /** Слева: поиск, сортировка, доп. фильтры. */
  start: ReactNode;
  /** Справа: счётчик, основные кнопки. */
  end?: ReactNode;
  className?: string;
};

/**
 * Один горизонтальный ряд тулбара: фильтры слева, действия справа (как каталог упражнений ЛФК).
 */
export function DoctorCatalogToolbarMainRow({ start, end, className }: DoctorCatalogToolbarMainRowProps) {
  return (
    <div className={cn("flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-3", className)}>
      <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">{start}</div>
      {end ? (
        <div className="flex w-full min-w-0 shrink-0 flex-col gap-2 sm:w-auto sm:flex-row sm:items-center sm:justify-end">{end}</div>
      ) : null}
    </div>
  );
}
