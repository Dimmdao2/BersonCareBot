"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type DoctorCatalogPageLayoutProps = {
  /** Липкий блок фильтров/поиска (классы см. `DOCTOR_CATALOG_STICKY_BAR_CLASS` в doctorWorkspaceLayout). */
  toolbar?: ReactNode;
  children: ReactNode;
  className?: string;
};

/** Обёртка каталожной страницы врача: опциональный липкий блок + контент (master-detail). */
export function DoctorCatalogPageLayout({ toolbar, children, className }: DoctorCatalogPageLayoutProps) {
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {toolbar}
      {children}
    </div>
  );
}
