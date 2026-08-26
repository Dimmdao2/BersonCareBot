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
import { STAFF_SURFACE } from '@/config/productSurfaces';
import type { DoctorWorkspaceContext } from '@/modules/doctor-workspace/types';
import type { DoctorWorkspaceAccessContext } from '@/app-layer/guards/requireRole';
import { getPatientMaintenanceConfig } from '@/modules/system-settings/patientMaintenance';
import { sessionMatchesTestAccountIdentifiers } from '@/config/testAccounts';

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
  specialistTasksEnabled: boolean;
  canRenderClinicalChildren: boolean;
  maintenance: { enabled: boolean; message: string };
};

type LoadDoctorWorkspaceShell = (
  allowCabinetRecovery?: boolean,
) => Promise<DoctorWorkspaceShellData>;

/**
 * Request-local doctor shell bootstrap: one workspace resolution and one parallel
 * wave of org/settings/branding/entitlement reads per RSC request.
 */
const loadDoctorShell = cache(async (allowCabinetRecovery = false) => {
  const workspaceAccess = await requireOrganizationWorkspaceContext({ allowCabinetRecovery });
  const session = workspaceAccess.session;
  const deps = buildAppDeps();
  const organizationId = workspaceAccess.organizationId;

  const [organization, doctorSettings, effectiveBranding, maintenance] = await Promise.all([
    deps.bookingEngine
      ? deps.bookingEngine.organization.getOrganization(organizationId)
      : Promise.resolve(null),
    deps.systemSettings.listSettingsByScope('doctor', { organizationId }),
    deps.orgBranding.resolveEffectiveOrgBranding(organizationId).catch(() => null),
    getPatientMaintenanceConfig(),
  ]);

  const [
    coursesVisibility,
    promoVisibility,
    cmsVisibility,
    patientHomeTodayVisibility,
    specialistTasksVisibility,
    entitlementSnapshot,
    cabinetAccess,
    lifecycleAnchors,
  ] = await Promise.all([
    getMechanicSurfaceVisibility(workspaceAccess, 'courses'),
    getMechanicSurfaceVisibility(workspaceAccess, 'promo'),
    getMechanicSurfaceVisibility(workspaceAccess, 'cms_pages'),
    getMechanicSurfaceVisibility(workspaceAccess, 'patient_home_today'),
    getMechanicSurfaceVisibility(workspaceAccess, 'specialist_tasks'),
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
    displayName: effectiveBranding?.effectiveDisplayName ?? organization?.title ?? STAFF_SURFACE.name,
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
  const isTestAccount = sessionMatchesTestAccountIdentifiers({
    userId: session.user.userId,
    phone: session.user.phone,
    telegramId: session.user.bindings.telegramId,
    maxId: session.user.bindings.maxId,
  });

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
    specialistTasksEnabled: specialistTasksVisibility.specialistNavigation,
    canRenderClinicalChildren,
    maintenance: {
      enabled: maintenance.enabled && session.user.role !== 'admin' && !isTestAccount,
      message: maintenance.message,
    },
  };
});

export const loadDoctorWorkspaceShell: LoadDoctorWorkspaceShell = loadDoctorShell;
