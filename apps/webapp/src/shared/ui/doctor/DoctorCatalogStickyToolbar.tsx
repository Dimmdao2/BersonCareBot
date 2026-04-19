"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  DOCTOR_CATALOG_STICKY_BAR_CLASS,
  DOCTOR_STICKY_PAGE_TOOLBAR_TOP_CLASS,
} from "@/shared/ui/doctorWorkspaceLayout";

export type DoctorCatalogStickyToolbarProps = {
  children: ReactNode;
  className?: string;
};

/** Липкая верхняя полоска каталога врача: совмещается с `DoctorCatalogPageLayout` и отступами контейнера. */
export function DoctorCatalogStickyToolbar({ children, className }: DoctorCatalogStickyToolbarProps) {
  return <div className={cn(DOCTOR_CATALOG_STICKY_BAR_CLASS, DOCTOR_STICKY_PAGE_TOOLBAR_TOP_CLASS, className)}>{children}</div>;
}
