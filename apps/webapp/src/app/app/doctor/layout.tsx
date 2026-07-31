/**
 * Layout раздела кабинета специалиста (/app/doctor).
 * Шапка на всю ширину; на md+ под ней слева меню разделов (`DoctorAdminSidebar`), справа контент.
 */
import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import '../../styles/doctor.css';
import {
  entitlementGraceWarningMessages,
  getMechanicSurfaceVisibility,
} from '@/app-layer/guards/requireEntitlement';
import { cabinetGraceWarningMessages } from '@/app-layer/guards/cabinetAccessGate';
import { requireOrganizationWorkspaceContext } from '@/app-layer/guards/requireRole';
import { getCurrentSession } from '@/modules/auth/service';
import {
  hasLaunchCapability,
  resolveLaunchCapabilities,
} from '@/app-layer/guards/workspaceCapabilities';
import { staffPwaLayoutMetadata } from '@/shared/lib/pwa/staffPwaLayoutMetadata';
import { DoctorWorkspaceShell } from '@/shared/ui/doctor/shell/DoctorWorkspaceShell';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import type { DoctorWorkspaceContext } from '@/modules/doctor-workspace/types';

export const metadata: Metadata = staffPwaLayoutMetadata;

function getValueJson<T>(valueJson: unknown, fallback: T): T {
  if (
    valueJson !== null &&
    typeof valueJson === 'object' &&
    'value' in (valueJson as Record<string, unknown>)
  ) {
    return (valueJson as Record<string, unknown>).value as T;
  }
  return fallback;
}

export default async function DoctorSectionLayout({ children }: { children: ReactNode }) {
  // Platform URLs live under `/app/admin/**` (renamed from `/app/platform/**` by owner ruling
  // 2026-07-26; see doctorRouteRedirects.ts) and, until slices 5-7 finish moving them, still
  // partly under `(global-admin)/doctor/**` — both outside this clinical layout. Keep the
  // historical `/app/doctor` entry as a non-looping platform landing rather than allowing a
  // platform principal to render a clinical child beneath this shell.
  const currentSession = await getCurrentSession();
  if (
    currentSession &&
    hasLaunchCapability(
      resolveLaunchCapabilities({
        sessionRole: currentSession.user.role,
        adminMode: currentSession.adminMode,
      }),
      'platform.operations',
    )
  ) {
    redirect('/app/admin/system-health');
  }
  const workspaceAccess = await requireOrganizationWorkspaceContext();
  const session = workspaceAccess.session;
  if (!workspaceAccess.canAccessClinicalWorkspace && !workspaceAccess.canManageOrganization) {
    // Only a self-signup owner with the already-provisioned specialist card can be in the
    // progressive 2FA-first-run state. Let that request reach the root onboarding page; every
    // clinical child has its own workspace guard.
    if (workspaceAccess.membershipRole === 'owner' && workspaceAccess.specialistId !== null) {
      return children;
    }
    redirect('/app/settings?tab=organization');
  }
  const deps = buildAppDeps();
  const [organization, doctorSettings, effectiveBranding] = await Promise.all([
    deps.bookingEngine
      ? deps.bookingEngine.organization.getOrganization(workspaceAccess.organizationId)
      : Promise.resolve(null),
    deps.systemSettings.listSettingsByScope('doctor', {
      organizationId: workspaceAccess.organizationId,
    }),
    // UX-05 B2: the staff shell brand mark is resolved server-side only — the client never
    // supplies the effective logo URL or organization name (BRANDING_DOMAIN_CONTRACT.md §3.6).
    // A resolution failure degrades to platform visuals below rather than 500ing the whole shell.
    deps.orgBranding.resolveEffectiveOrgBranding(workspaceAccess.organizationId).catch(() => null),
  ]);
  const [coursesVisibility, promoVisibility, cmsVisibility, entitlementSnapshot, cabinetAccess] =
    await Promise.all([
      getMechanicSurfaceVisibility(workspaceAccess, 'courses'),
      getMechanicSurfaceVisibility(workspaceAccess, 'promo'),
      getMechanicSurfaceVisibility(workspaceAccess, 'cms_pages'),
      deps.orgEntitlements.getSnapshot(workspaceAccess.organizationId).catch(() => null),
      // The cabinet is its own ladder subject (§5a/2.1a). Reaching this layout already means entry is
      // open, so the only thing left to show is the `терпение` countdown for the cabinet itself.
      deps.orgEntitlements.resolveCabinetAccess(workspaceAccess.organizationId).catch(() => null),
    ]);
  const tariffName = entitlementSnapshot?.tariff?.name ?? null;
  const coursesEnabled = coursesVisibility.specialistNavigation;
  const promoEnabled = promoVisibility.specialistNavigation;
  const cmsEnabled = cmsVisibility.specialistNavigation;
  // §5a item 2.6a — the banner shows the OWNER's notification texts, rendered from his ladder.
  // The variable map is open: a placeholder this shell cannot fill stays visible instead of
  // silently blanking, so an unsupplied variable is a defect the owner can see in his own text.
  const accessNotificationVariables = {
    клиника: organization?.title ?? '',
    тариф: tariffName ?? '',
  };
  // One system-level ladder produces the same text for every mechanic it covers, so identical
  // lines are collapsed — the owner wrote one notification, he sees it once.
  const accessWarnings = [
    ...(cabinetAccess?.warning ? cabinetGraceWarningMessages(cabinetAccess.warning, accessNotificationVariables) : []),
    ...new Set(
      [coursesVisibility, promoVisibility, cmsVisibility].flatMap((visibility) =>
        visibility.warning
          ? entitlementGraceWarningMessages(visibility.warning, accessNotificationVariables)
          : [],
      ),
    ),
  ];
  const shellBrand = {
    displayName: effectiveBranding?.effectiveDisplayName ?? organization?.title ?? 'BersonCare',
    logoUrl: effectiveBranding?.paid.logoUrl ?? null,
  };
  const workspaceContext: DoctorWorkspaceContext = {
    organizationId: workspaceAccess.organizationId,
    organizationName: organization?.title ?? null,
    membershipId: workspaceAccess.membershipId,
    membershipRole: workspaceAccess.membershipRole,
    specialistId: workspaceAccess.specialistId,
    canManageOrganization: workspaceAccess.canManageOrganization,
    canManageAllSpecialists: workspaceAccess.canManageAllSpecialists,
    canAccessClinicalWorkspace: workspaceAccess.canAccessClinicalWorkspace,
    selectedSpecialistId: workspaceAccess.canManageAllSpecialists
      ? null
      : workspaceAccess.specialistId,
  };
  // P0.11.3: patient_label is PER-ORG (see orgScopedKeys.ts) — org-first, global-fallback.
  const patientLabel = getValueJson(
    doctorSettings.find((x) => x.key === 'patient_label')?.valueJson,
    'пациент',
  );
  return (
    <DoctorWorkspaceShell
      adminMode={session.adminMode ?? false}
      userRole={session.user.role}
      userDisplayName={session.user.displayName}
      patientLabel={String(patientLabel)}
      workspaceContext={workspaceContext}
      coursesEnabled={coursesEnabled}
      promoEnabled={promoEnabled}
      cmsEnabled={cmsEnabled}
      brand={shellBrand}
    >
      {accessWarnings.length > 0 ? (
        <div
          className="m-3 space-y-1 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950"
          role="alert"
        >
          {accessWarnings.map((warning) => (
            <p key={warning}>{warning}</p>
          ))}
        </div>
      ) : null}
      {children}
    </DoctorWorkspaceShell>
  );
}
