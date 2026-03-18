/**
 * Layout раздела кабинета специалиста (/app/doctor).
 * Оборачивает все страницы раздела врача общей навигацией по разделам.
 */
import type { ReactNode } from "react";
import { DoctorNavigation } from "@/shared/ui/DoctorNavigation";

export default function DoctorSectionLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <DoctorNavigation />
      {children}
    </>
  );
}
