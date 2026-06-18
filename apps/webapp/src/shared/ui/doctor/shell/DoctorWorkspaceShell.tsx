import type { ReactNode } from "react";
import { Suspense } from "react";
import { AppAccessDeniedToastEffect } from "@/shared/ui/AppAccessDeniedToastEffect";
import { StaffPwaBootstrap } from "@/shared/ui/doctor/pwa/StaffPwaBootstrap";
import { StaffWebPushBootstrap } from "@/shared/ui/doctor/pwa/StaffWebPushBootstrap";
import { canAccessDoctor } from "@/modules/roles/service";
import { DoctorAdminSidebar } from "@/shared/ui/doctor/shell/DoctorAdminSidebar";
import { DoctorHeader } from "@/shared/ui/doctor/shell/DoctorHeader";
import { DoctorSupportUnreadProvider } from "@/shared/ui/doctor/shell/DoctorSupportUnreadProvider";
import { DOCTOR_WORKSPACE_TOP_PADDING_CLASS } from "@/shared/ui/doctor/doctorWorkspaceLayout";
import type { UserRole } from "@/shared/types/session";
import { cn } from "@/lib/utils";

type DoctorWorkspaceShellProps = {
  adminMode: boolean;
  /** Роль из сессии: левое меню на md+ для всех с доступом к кабинету врача, не только в admin mode. */
  userRole: UserRole;
  userDisplayName?: string;
  /** Если `"клиент"`, пункт «Пациенты» в сайдбаре отображается как «Клиенты». */
  patientLabel?: string;
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
  children,
}: DoctorWorkspaceShellProps) {
  const showDoctorDesktopNav = canAccessDoctor(userRole);

  return (
    <DoctorSupportUnreadProvider>
      <Suspense fallback={null}>
        <AppAccessDeniedToastEffect />
      </Suspense>
      <StaffPwaBootstrap />
      <StaffWebPushBootstrap />
      <div className="flex min-h-screen flex-col bg-background">
        <DoctorHeader
          userDisplayName={userDisplayName}
          adminMode={adminMode}
          menuAccess={{ role: userRole, adminMode }}
          patientLabel={patientLabel}
          hideMenuOnDesktop={showDoctorDesktopNav}
        />
        <div className={cn("flex min-h-0 flex-1", DOCTOR_WORKSPACE_TOP_PADDING_CLASS)}>
          {showDoctorDesktopNav ? (
            <DoctorAdminSidebar
              userDisplayName={userDisplayName}
              menuAccess={{ role: userRole, adminMode }}
              patientLabel={patientLabel}
            />
          ) : null}
          <div className="flex min-w-0 flex-1 flex-col">{children}</div>
        </div>
      </div>
    </DoctorSupportUnreadProvider>
  );
}
