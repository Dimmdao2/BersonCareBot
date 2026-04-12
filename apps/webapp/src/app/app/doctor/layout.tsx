/**
 * Layout раздела кабинета специалиста (/app/doctor).
 * В admin mode на md+: слева `DoctorAdminSidebar`, шапка и контент — в колонке справа (`md:pl-56`, шапка `md:left-56`).
 * Отступ под шапку — `DOCTOR_WORKSPACE_TOP_PADDING_CLASS`. Контент — `AppShell variant="doctor"`.
 */
import type { ReactNode } from "react";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { DoctorAdminSidebar } from "@/shared/ui/DoctorAdminSidebar";
import { DoctorHeader } from "@/shared/ui/DoctorHeader";
import {
  DOCTOR_ADMIN_MAIN_OFFSET_CLASS,
  DOCTOR_WORKSPACE_TOP_PADDING_CLASS,
} from "@/shared/ui/doctorWorkspaceLayout";
import { cn } from "@/lib/utils";

export default async function DoctorSectionLayout({ children }: { children: ReactNode }) {
  const session = await requireDoctorAccess();
  const { adminMode } = session;
  return (
    <div className="min-h-screen bg-muted/30">
      {adminMode ? <DoctorAdminSidebar userDisplayName={session.user.displayName} /> : null}
      <div
        className={cn(
          "min-w-0",
          adminMode && DOCTOR_ADMIN_MAIN_OFFSET_CLASS,
        )}
      >
        <DoctorHeader
          userDisplayName={session.user.displayName}
          adminMode={adminMode}
          hideMenuOnDesktop={adminMode}
        />
        {/* Фиксированная шапка h-14 + safe-area + небольшой зазор, чтобы контент не прилипал */}
        <div className={DOCTOR_WORKSPACE_TOP_PADDING_CLASS}>{children}</div>
      </div>
    </div>
  );
}
