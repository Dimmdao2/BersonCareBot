import type { ReactNode } from "react";
import { canAccessDoctor } from "@/modules/roles/service";
import { DoctorAdminSidebar } from "@/shared/ui/DoctorAdminSidebar";
import { DoctorHeader } from "@/shared/ui/DoctorHeader";
import { DOCTOR_WORKSPACE_TOP_PADDING_CLASS } from "@/shared/ui/doctorWorkspaceLayout";
import type { UserRole } from "@/shared/types/session";
import { cn } from "@/lib/utils";

type DoctorWorkspaceShellProps = {
  adminMode: boolean;
  /** Роль из сессии: левое меню на md+ для всех с доступом к кабинету врача, не только в admin mode. */
  userRole: UserRole;
  userDisplayName?: string;
  children: ReactNode;
};

/**
 * Общий каркас кабинета врача/админа: шапка на всю ширину, под ней ряд «сайдбар (md+) | контент».
 */
export function DoctorWorkspaceShell({
  adminMode,
  userRole,
  userDisplayName,
  children,
}: DoctorWorkspaceShellProps) {
  const showDoctorDesktopNav = canAccessDoctor(userRole);

  return (
    <div className="flex min-h-screen flex-col bg-muted/30">
      <DoctorHeader
        userDisplayName={userDisplayName}
        adminMode={adminMode}
        hideMenuOnDesktop={showDoctorDesktopNav}
      />
      <div className={cn("flex min-h-0 flex-1", DOCTOR_WORKSPACE_TOP_PADDING_CLASS)}>
        {showDoctorDesktopNav ? <DoctorAdminSidebar userDisplayName={userDisplayName} /> : null}
        <div className="flex min-w-0 flex-1 flex-col">{children}</div>
      </div>
    </div>
  );
}
