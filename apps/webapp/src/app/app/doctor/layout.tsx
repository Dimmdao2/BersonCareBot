/**
 * Layout раздела кабинета специалиста (/app/doctor).
 * Фиксированная шапка и меню — `DoctorHeader`; контент страниц — в `AppShell variant="doctor"`.
 */
import type { ReactNode } from "react";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { DoctorHeader } from "@/shared/ui/DoctorHeader";

export default async function DoctorSectionLayout({ children }: { children: ReactNode }) {
  const session = await requireDoctorAccess();
  return (
    <div className="min-h-screen bg-muted/30">
      {/* TODO(STAGE_02): при появлении отдельного десктоп-layout — sidebar placeholder hidden md:block w-64 */}
      <DoctorHeader userDisplayName={session.user.displayName} adminMode={session.adminMode} />
      {/* Фиксированная шапка h-14 + safe-area + небольшой зазор, чтобы контент не прилипал */}
      <div className="pt-[calc(3.5rem+env(safe-area-inset-top,0px)+0.5rem)]">{children}</div>
    </div>
  );
}
