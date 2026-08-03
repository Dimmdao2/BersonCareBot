import type { ReactNode } from 'react';
import { Suspense } from 'react';
import { AppAccessDeniedToastEffect } from '@/shared/ui/AppAccessDeniedToastEffect';
import { StaffPwaBootstrap } from '@/shared/ui/doctor/pwa/StaffPwaBootstrap';
import { StaffWebPushBootstrap } from '@/shared/ui/doctor/pwa/StaffWebPushBootstrap';
import { canAccessDoctor } from '@/modules/roles/service';
import { resolveLaunchCapabilities } from '@/app-layer/guards/workspaceCapabilities';
import { DoctorAdminSidebar } from '@/shared/ui/doctor/shell/DoctorAdminSidebar';
import { DoctorHeader } from '@/shared/ui/doctor/shell/DoctorHeader';
import { DoctorSupportUnreadProvider } from '@/shared/ui/doctor/shell/DoctorSupportUnreadProvider';
import { getDoctorShellHomeHref } from '@/shared/ui/doctor/doctorNavLinks';
import { DOCTOR_WORKSPACE_TOP_PADDING_CLASS } from '@/shared/ui/doctor/doctorWorkspaceLayout';
import type { UserRole } from '@/shared/types/session';
import type { DoctorWorkspaceContext } from '@/modules/doctor-workspace/types';
import { cn } from '@/lib/utils';

type DoctorWorkspaceShellProps = {
  isPlatformOperator: boolean;
  /** Роль из сессии: левое меню на md+ для всех с доступом к кабинету врача, не только в admin mode. */
  userRole: UserRole;
  userDisplayName?: string;
  /** Если `"клиент"`, пункт «Пациенты» в сайдбаре отображается как «Клиенты». */
  patientLabel?: string;
  /** Stable server-resolved org/member context for nested multi-specialist workspace controls. */
  workspaceContext?: DoctorWorkspaceContext;
  /** Server-resolved organization entitlement; the client shell never infers it from role. */
  coursesEnabled?: boolean;
  promoEnabled?: boolean;
  cmsEnabled?: boolean;
  patientHomeTodayEnabled?: boolean;
  /** Disable tenant-only background badge requests on global operator surfaces. */
  enableTenantRuntime?: boolean;
  /**
   * Server-resolved effective organization brand (UX-05 B2) for the sidebar brand mark. Never
   * computed client-side — see `app/doctor/layout.tsx`. Omitted on non-clinical shells (account,
   * global-admin, manage), which keep the platform-default mark.
   */
  brand?: { displayName: string; logoUrl: string | null };
  /**
   * Which item source `DoctorMenuAccordion` renders: `"doctor"` (default) is the clinical/staff
   * menu; `"platform"` is the global admin's own flat menu. Owner ruling 2026-07-26: the global
   * admin is not a doctor, so its shell instances (`(global-admin)/doctor/layout.tsx`, the new
   * `app/platform/layout.tsx`) pass `"platform"` explicitly.
   */
  menuKind?: 'doctor' | 'platform';
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
  isPlatformOperator,
  userRole,
  userDisplayName,
  patientLabel,
  workspaceContext,
  coursesEnabled = false,
  promoEnabled = false,
  cmsEnabled = false,
  patientHomeTodayEnabled = false,
  enableTenantRuntime = true,
  brand,
  menuKind = 'doctor',
  children,
}: DoctorWorkspaceShellProps) {
  const capabilities = Array.from(
    resolveLaunchCapabilities({
      sessionRole: userRole,
      membershipRole: workspaceContext?.membershipRole,
      specialistId: workspaceContext?.specialistId,
      canManageOrganization: workspaceContext?.canManageOrganization,
      canAccessClinicalWorkspace: workspaceContext?.canAccessClinicalWorkspace,
    }),
  );
  const showDoctorDesktopNav =
    canAccessDoctor(userRole) &&
    (capabilities.includes('clinical.workspace') ||
      capabilities.includes('organization.management') ||
      capabilities.includes('platform.operations'));
  const menuAccess = {
    capabilities,
    coursesEnabled,
    promoEnabled,
    cmsEnabled,
    patientHomeTodayEnabled,
  };
  const homeHref = getDoctorShellHomeHref(menuAccess);
  const showClinicalShortcuts = capabilities.includes('clinical.workspace');

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
          isPlatformOperator={isPlatformOperator}
          menuAccess={menuAccess}
          patientLabel={patientLabel}
          hideMenuOnDesktop={showDoctorDesktopNav}
          enableBadgePolling={enableTenantRuntime}
          homeHref={homeHref}
          showClinicalShortcuts={showClinicalShortcuts}
          menuKind={menuKind}
        />
        <div className={cn('flex min-h-0 flex-1', DOCTOR_WORKSPACE_TOP_PADDING_CLASS)}>
          {showDoctorDesktopNav ? (
            <DoctorAdminSidebar
              userDisplayName={userDisplayName}
              menuAccess={menuAccess}
              patientLabel={patientLabel}
              enableBadgePolling={enableTenantRuntime}
              homeHref={homeHref}
              brand={brand}
              menuKind={menuKind}
            />
          ) : null}
          <div className="flex min-w-0 flex-1 flex-col">{children}</div>
        </div>
      </div>
    </DoctorSupportUnreadProvider>
  );
}
