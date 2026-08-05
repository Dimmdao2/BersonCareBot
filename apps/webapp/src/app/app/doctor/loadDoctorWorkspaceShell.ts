import { cache } from 'react';
import { runWithDbClinicBillingPrincipal } from '@bersoncare/db-principal';
import {
  entitlementGraceWarningMessages,
  getMechanicSurfaceVisibility,
} from '@/app-layer/guards/requireEntitlement';
import {
  cabinetGraceWarningMessages,
  cabinetLifecycleWarningMessages,
} from '@/app-layer/guards/cabinetAccessGate';
import { resolveCabinetAccessRequestLocal } from '@/app-layer/guards/cabinetAccessRequestLocal';
import { requireOrganizationWorkspaceContext } from '@/app-layer/guards/requireRole';
import {
  ACCESS_NOTIFICATION_VARIABLES,
  accessNotificationBillingVariables,
  organizationHasPaidSinceTrial,
} from '@/modules/org-entitlements/accessNotifications';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import type { DoctorWorkspaceContext } from '@/modules/doctor-workspace/types';
import type { DoctorWorkspaceAccessContext } from '@/app-layer/guards/requireRole';

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

export type DoctorWorkspaceShellData = {
  workspaceAccess: DoctorWorkspaceAccessContext;
  session: DoctorWorkspaceAccessContext['session'];
  workspaceContext: DoctorWorkspaceContext;
  accessWarnings: string[];
  shellBrand: {
    displayName: string;
    logoUrl: string | null;
  };
  patientLabel: string;
  coursesEnabled: boolean;
  promoEnabled: boolean;
  cmsEnabled: boolean;
  patientHomeTodayEnabled: boolean;
  canRenderClinicalChildren: boolean;
};

/**
 * Request-local doctor shell bootstrap: one workspace resolution and one parallel
 * wave of org/settings/branding/entitlement reads per RSC request.
 */
export const loadDoctorWorkspaceShell = cache(async (): Promise<DoctorWorkspaceShellData> => {
  const workspaceAccess = await requireOrganizationWorkspaceContext();
  const session = workspaceAccess.session;
  const deps = buildAppDeps();
  const organizationId = workspaceAccess.organizationId;

  const [organization, doctorSettings, effectiveBranding] = await Promise.all([
    deps.bookingEngine
      ? deps.bookingEngine.organization.getOrganization(organizationId)
      : Promise.resolve(null),
    deps.systemSettings.listSettingsByScope('doctor', { organizationId }),
    deps.orgBranding.resolveEffectiveOrgBranding(organizationId).catch(() => null),
  ]);

  const [
    coursesVisibility,
    promoVisibility,
    cmsVisibility,
    patientHomeTodayVisibility,
    entitlementSnapshot,
    cabinetAccess,
    lifecycleAnchors,
  ] = await Promise.all([
    getMechanicSurfaceVisibility(workspaceAccess, 'courses'),
    getMechanicSurfaceVisibility(workspaceAccess, 'promo'),
    getMechanicSurfaceVisibility(workspaceAccess, 'cms_pages'),
    getMechanicSurfaceVisibility(workspaceAccess, 'patient_home_today'),
    deps.orgEntitlements.getSnapshot(organizationId).catch(() => null),
    resolveCabinetAccessRequestLocal(organizationId).catch(() => null),
    deps.orgEntitlements.prepareLifecycleNotificationContext(organizationId).catch(() => null),
  ]);

  const billingOverview = await runWithDbClinicBillingPrincipal(
    {
      organizationId,
      platformUserId: session.user.userId,
      source: 'doctor-layout-billing-warning-read',
    },
    () => deps.saasBilling.getOrganizationBillingOverview(organizationId),
  ).catch(() => null);

  const tariffName = entitlementSnapshot?.tariff?.name ?? null;
  const accessNotificationVariables = {
    клиника: organization?.title ?? '',
    тариф: tariffName ?? '',
  } satisfies Partial<Record<(typeof ACCESS_NOTIFICATION_VARIABLES)[number]['name'], string>>;

  const systemNotifications = entitlementSnapshot?.tariff?.systemAccessPolicy?.notifications ?? [];
  const hasPaidSinceTrial = organizationHasPaidSinceTrial(
    lifecycleAnchors?.trialEndsAt ?? null,
    billingOverview,
  );

  const accessWarnings = [
    ...(cabinetAccess?.warning
      ? cabinetGraceWarningMessages(cabinetAccess.warning, {
          ...accessNotificationVariables,
          ...accessNotificationBillingVariables(cabinetAccess.warning, billingOverview),
        })
      : []),
    ...cabinetLifecycleWarningMessages({
      notifications: systemNotifications,
      anchors: lifecycleAnchors ?? {
        registeredAt: null,
        trialStartedAt: null,
        trialEndsAt: null,
        discountEndsAt: null,
      },
      hasPaidSinceTrial,
      variables: accessNotificationVariables,
    }),
    ...new Set(
      [coursesVisibility, promoVisibility, cmsVisibility].flatMap((visibility) =>
        visibility.warning
          ? entitlementGraceWarningMessages(visibility.warning, {
              ...accessNotificationVariables,
              ...accessNotificationBillingVariables(visibility.warning, billingOverview),
            })
          : [],
      ),
    ),
  ];

  const shellBrand = {
    displayName: effectiveBranding?.effectiveDisplayName ?? organization?.title ?? 'BersonCare',
    logoUrl: effectiveBranding?.paid.logoUrl ?? null,
  };

  const workspaceContext: DoctorWorkspaceContext = {
    organizationId,
    organizationName: organization?.title ?? null,
    membershipId: workspaceAccess.membershipId,
    membershipRole: workspaceAccess.membershipRole,
    specialistId: workspaceAccess.specialistId,
    canManageOrganization: workspaceAccess.canManageOrganization,
    canManageAllSpecialists: workspaceAccess.canManageAllSpecialists,
    canAccessClinicalWorkspace: workspaceAccess.canAccessClinicalWorkspace,
    doctorScreensDisabled: workspaceAccess.doctorScreensDisabled,
    selectedSpecialistId: workspaceAccess.canManageAllSpecialists
      ? null
      : workspaceAccess.specialistId,
  };

  const patientLabel = getValueJson(
    doctorSettings.find((x) => x.key === 'patient_label')?.valueJson,
    'пациент',
  );

  const canRenderClinicalChildren =
    workspaceAccess.canAccessClinicalWorkspace ||
    workspaceAccess.canManageOrganization ||
    (workspaceAccess.membershipRole === 'owner' && workspaceAccess.specialistId !== null);

  return {
    workspaceAccess,
    session,
    workspaceContext,
    accessWarnings,
    shellBrand,
    patientLabel: String(patientLabel),
    coursesEnabled: coursesVisibility.specialistNavigation,
    promoEnabled: promoVisibility.specialistNavigation,
    cmsEnabled: cmsVisibility.specialistNavigation,
    patientHomeTodayEnabled: patientHomeTodayVisibility.specialistNavigation,
    canRenderClinicalChildren,
  };
});
