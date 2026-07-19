import type { ReactNode } from "react";
import { Suspense } from "react";
import { AppAccessDeniedToastEffect } from "@/shared/ui/AppAccessDeniedToastEffect";
import { StaffPwaBootstrap } from "@/shared/ui/doctor/pwa/StaffPwaBootstrap";
import { StaffWebPushBootstrap } from "@/shared/ui/doctor/pwa/StaffWebPushBootstrap";
import { canAccessDoctor } from "@/modules/roles/service";
import { resolveLaunchCapabilities } from "@/app-layer/guards/workspaceCapabilities";
import { DoctorAdminSidebar } from "@/shared/ui/doctor/shell/DoctorAdminSidebar";
import { DoctorHeader } from "@/shared/ui/doctor/shell/DoctorHeader";
import { DoctorSupportUnreadProvider } from "@/shared/ui/doctor/shell/DoctorSupportUnreadProvider";
import { DOCTOR_WORKSPACE_TOP_PADDING_CLASS } from "@/shared/ui/doctor/doctorWorkspaceLayout";
import type { UserRole } from "@/shared/types/session";
import type { DoctorWorkspaceContext } from "@/modules/doctor-workspace/types";
import { cn } from "@/lib/utils";

type DoctorWorkspaceShellProps = {
  adminMode: boolean;
  /** Роль из сессии: левое меню на md+ для всех с доступом к кабинету врача, не только в admin mode. */
  userRole: UserRole;
  userDisplayName?: string;
  /** Если `"клиент"`, пункт «Пациенты» в сайдбаре отображается как «Клиенты». */
  patientLabel?: string;
  /** Stable server-resolved org/member context for nested multi-specialist workspace controls. */
  workspaceContext?: DoctorWorkspaceContext;
  /** Disable tenant-only background badge requests on global operator surfaces. */
  enableTenantRuntime?: boolean;
  children: ReactNode;
};

/**
 * Общий каркас кабинета врача/админа.
 *
 * - Мобильный (<md): сверху фиксированная `DoctorHeader` (компактная шапка + Sheet-меню),
 *   контент с верхним отступом под её высоту.
 * - Desktop (md+): глобальной шапки нет (`DoctorHeader` → `md:hidden`); кабинет = ряд
 *   «`DoctorAdminSidebar` | контент». Роль липкого якоря на странице выполняет
 *   per-page `DoctorPageHeader` внутри контента.
 */
export function DoctorWorkspaceShell({
  adminMode,
  userRole,
  userDisplayName,
  patientLabel,
  workspaceContext,
  enableTenantRuntime = true,
  children,
}: DoctorWorkspaceShellProps) {
  const capabilities = Array.from(
    resolveLaunchCapabilities({
      sessionRole: userRole,
      adminMode,
      membershipRole: workspaceContext?.membershipRole,
      specialistId: workspaceContext?.specialistId,
      canManageOrganization: workspaceContext?.canManageOrganization,
      canAccessClinicalWorkspace: workspaceContext?.canAccessClinicalWorkspace,
    }),
  );
  const showDoctorDesktopNav =
    canAccessDoctor(userRole) &&
    (capabilities.includes("clinical.workspace") ||
      capabilities.includes("organization.management") ||
      capabilities.includes("platform.operations"));
  const menuAccess = {
    capabilities,
  };

  return (
    <DoctorSupportUnreadProvider enabled={enableTenantRuntime}>
      <Suspense fallback={null}>
        <AppAccessDeniedToastEffect />
      </Suspense>
      <StaffPwaBootstrap />
      <StaffWebPushBootstrap />
      <div className="flex min-h-screen flex-col bg-background">
        <DoctorHeader
          userDisplayName={userDisplayName}
          adminMode={adminMode}
          menuAccess={menuAccess}
          patientLabel={patientLabel}
          hideMenuOnDesktop={showDoctorDesktopNav}
          enableBadgePolling={enableTenantRuntime}
        />
        <div className={cn("flex min-h-0 flex-1", DOCTOR_WORKSPACE_TOP_PADDING_CLASS)}>
          {showDoctorDesktopNav ? (
            <DoctorAdminSidebar
              userDisplayName={userDisplayName}
              menuAccess={menuAccess}
              patientLabel={patientLabel}
              enableBadgePolling={enableTenantRuntime}
            />
          ) : null}
          <div className="flex min-w-0 flex-1 flex-col">{children}</div>
        </div>
      </div>
    </DoctorSupportUnreadProvider>
  );
}
