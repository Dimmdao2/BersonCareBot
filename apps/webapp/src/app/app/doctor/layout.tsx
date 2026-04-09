/**
 * Layout раздела кабинета специалиста (/app/doctor).
 * Фиксированная шапка — `DoctorHeader`; отступ под неё — `DOCTOR_WORKSPACE_TOP_PADDING_CLASS`.
 * Контент страниц — в `AppShell variant="doctor"` (см. `shared/ui/doctorWorkspaceLayout.ts`).
 */
import type { ReactNode } from "react";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { DoctorHeader } from "@/shared/ui/DoctorHeader";
import { DOCTOR_WORKSPACE_TOP_PADDING_CLASS } from "@/shared/ui/doctorWorkspaceLayout";

export default async function DoctorSectionLayout({ children }: { children: ReactNode }) {
  const session = await requireDoctorAccess();
  return (
    <div className="min-h-screen bg-muted/30">
      {/* TODO(AUDIT-BACKLOG-022): при появлении отдельного десктоп-layout — sidebar placeholder hidden md:block w-64 (STAGE_02). */}
      <DoctorHeader userDisplayName={session.user.displayName} adminMode={session.adminMode} />
      {/* Фиксированная шапка h-14 + safe-area + небольшой зазор, чтобы контент не прилипал */}
      <div className={DOCTOR_WORKSPACE_TOP_PADDING_CLASS}>{children}</div>
    </div>
  );
}
