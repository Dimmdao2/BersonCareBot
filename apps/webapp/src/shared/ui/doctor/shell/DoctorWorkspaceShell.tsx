import type { ReactNode } from 'react';
import { Suspense } from 'react';
import { AppAccessDeniedToastEffect } from '@/shared/ui/AppAccessDeniedToastEffect';
import { StaffPwaBootstrap } from '@/shared/ui/doctor/pwa/StaffPwaBootstrap';
import { StaffWebPushBootstrap } from '@/shared/ui/doctor/pwa/StaffWebPushBootstrap';
import { StaffCalendarTimezoneBootstrap } from '@/shared/ui/doctor/StaffCalendarTimezoneBootstrap';
import { canAccessDoctor } from '@/modules/roles/service';
import { resolveLaunchCapabilities } from '@/app-layer/guards/workspaceCapabilities';
import { DoctorAdminSidebar } from '@/shared/ui/doctor/shell/DoctorAdminSidebar';
import { DoctorWorkspaceViewport } from '@/shared/ui/doctor/shell/DoctorWorkspaceViewport';
import { DoctorShellChromeProvider } from '@/shared/ui/doctor/shell/DoctorShellChromeContext';
import { DoctorSupportUnreadProvider } from '@/shared/ui/doctor/shell/DoctorSupportUnreadProvider';
import { getDoctorShellHomeHref } from '@/shared/ui/doctor/doctorNavLinks';
import type { UserRole } from '@/shared/types/session';
import type { DoctorWorkspaceContext } from '@/modules/doctor-workspace/types';

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
  specialistTasksEnabled?: boolean;
  /** Server bootstrap for navigation-only attention dots; no client fetch is started for these. */
  initialNavigationAttention?: { unreadExerciseComments: boolean; overdueTasks: boolean };
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
 * - Tablet (md–lg): узкий sidebar rail раскрывается поверх контента.
 * - Desktop (lg+): полноценный sidebar располагается рядом с контентом.
 *   Роль липкого якоря на странице выполняет per-page `DoctorPageHeader` внутри контента.
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
  specialistTasksEnabled = false,
  initialNavigationAttention,
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
    specialistTasksEnabled,
  };
  const homeHref = getDoctorShellHomeHref(menuAccess);
  const showClinicalShortcuts = capabilities.includes('clinical.workspace');
  const clinicalRuntimeEnabled = enableTenantRuntime && showClinicalShortcuts;

  return (
    <DoctorSupportUnreadProvider
      enabled={clinicalRuntimeEnabled}
      registrationFailuresEnabled={
        clinicalRuntimeEnabled && capabilities.includes('platform.operations')
      }
      initialAttention={initialNavigationAttention}
    >
      <Suspense fallback={null}>
        <AppAccessDeniedToastEffect />
      </Suspense>
      <StaffPwaBootstrap />
      <StaffWebPushBootstrap />
      <StaffCalendarTimezoneBootstrap />
      <DoctorShellChromeProvider>
        <DoctorWorkspaceViewport
          header={{
            userDisplayName,
            isPlatformOperator,
            menuAccess,
            patientLabel,
            hideMenuOnDesktop: showDoctorDesktopNav,
            menuKind,
          }}
          sidebar={
            showDoctorDesktopNav ? (
              <DoctorAdminSidebar
                userDisplayName={userDisplayName}
                menuAccess={menuAccess}
                patientLabel={patientLabel}
                homeHref={homeHref}
                brand={brand}
                menuKind={menuKind}
              />
            ) : undefined
          }
          bottomNav={showClinicalShortcuts ? { menuAccess, patientLabel } : undefined}
        >
          {children}
        </DoctorWorkspaceViewport>
      </DoctorShellChromeProvider>
    </DoctorSupportUnreadProvider>
  );
}
