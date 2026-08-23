import type { ReactNode } from 'react';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { patientClientBusinessGate } from '@/app-layer/platform-access';
import {
  patientPathRequiresBoundPhone,
  resolvePatientLayoutPathname,
} from '@/modules/platform-access';
import { logger } from '@/infra/logging/logger';
import { routePaths } from '@/app-layer/routes/paths';
import { webappRuntimeDatabaseIsConfigured } from '@/config/env';
import { getCurrentSession } from '@/modules/auth/service';
import { buildOwnHubUrlWithAccessDeniedToast } from '@/shared/lib/appAccessDeniedToast';
import { canAccessPatient } from '@/modules/roles/service';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { getAppDisplayTimeZone } from '@/modules/system-settings/appDisplayTimezone';
import {
  getPatientMaintenanceConfig,
  patientMaintenanceReplacesPatientShell,
  patientMaintenanceSkipsPath,
} from '@/modules/system-settings/patientMaintenance';
import {
  PatientMaintenanceScreen,
  selectMaintenanceUpcomingBookings,
  type PatientMaintenanceBooking,
} from './PatientMaintenanceScreen';
import { PatientClientLayout } from './PatientClientLayout';
import {
  resolvePatientOrganizationRequestContext,
  stampPatientOrganizationRequestContext,
} from '@/app-layer/patient-organization/requestContext';
import { PatientOrganizationRecoveryScreen } from '@/shared/ui/patient/organization/PatientOrganizationContext';
import { getAuthChannelPolicy } from '@/modules/auth/authChannelPolicy';
import { isCabinetEntryBlocked } from '@/app-layer/guards/cabinetAccessGate';
import { getResolvedSurface } from '@/shared/lib/surface/requestSurface.server';

function patientPathAllowsGlobalAccountWithoutCareContext(pathname: string): boolean {
  return [
    routePaths.profile,
    routePaths.patientOrganizations,
    routePaths.bindPhone,
    routePaths.notifications,
    routePaths.patientInstall,
  ].some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

/**
 * Пациент не попадает в разделы вне allowlist без бизнес-доступа (tier **patient** при БД, иначе — телефон в сессии).
 * Путь: `x-bc-pathname` / `x-bc-search` из middleware; при пустом pathname — fallback по `referer` (`resolvePatientLayoutPathname`).
 */
export default async function PatientLayout({ children }: { children: ReactNode }) {
  // Bind module ports in this RSC module graph before any settings/auth policy read.
  // Next.js may compile instrumentation and route/layout chunks independently in dev.
  const deps = buildAppDeps();
  const h = await headers();
  const resolvedSurface = await getResolvedSurface();
  const pathname = resolvePatientLayoutPathname((name) => h.get(name));
  const search = h.get('x-bc-search') ?? '';
  const session = await getCurrentSession();

  if (!session) {
    const returnTo = (pathname.trim() ? pathname : routePaths.patient) + search;
    redirect(`${routePaths.root}?next=${encodeURIComponent(returnTo)}`);
  }

  if (!canAccessPatient(session.user.role)) {
    redirect(buildOwnHubUrlWithAccessDeniedToast(session.user.role));
  }

  const authChannelPolicy = await getAuthChannelPolicy();
  const materialRatingsEnabled = await deps.runtimeConfig.getServerBoolean(
    'material_ratings_enabled',
  );

  const returnTo = (pathname.trim() ? pathname : routePaths.patient) + search;

  const gate = await patientClientBusinessGate(session);

  const databaseConfigured = webappRuntimeDatabaseIsConfigured();
  if (databaseConfigured) {
    if (gate === 'stale_session') {
      redirect(`${routePaths.root}?next=${encodeURIComponent(returnTo)}`);
    }
  } else if (!session.user.phone?.trim() && patientPathRequiresBoundPhone(pathname)) {
    redirect(`${routePaths.bindPhone}?next=${encodeURIComponent(returnTo)}`);
  }

  if (session.user.role === 'client') {
    const patientContext = await resolvePatientOrganizationRequestContext(
      deps.patientOrganization,
      session.user.userId,
    );
    if (!patientContext.ok) {
      if (patientPathAllowsGlobalAccountWithoutCareContext(pathname)) {
        return (
          <PatientClientLayout
            authChannelPolicy={authChannelPolicy}
            materialRatingsEnabled={materialRatingsEnabled}
          >
            {children}
          </PatientClientLayout>
        );
      }
      return (
        <PatientClientLayout
          authChannelPolicy={authChannelPolicy}
          materialRatingsEnabled={materialRatingsEnabled}
        >
          <PatientOrganizationRecoveryScreen
            organizations={
              patientContext.reason === 'organization_selection_required'
                ? patientContext.organizations
                : []
            }
            invalidRememberedOrganization={
              patientContext.reason === 'organization_selection_required' &&
              patientContext.invalidRememberedOrganization
            }
          />
        </PatientClientLayout>
      );
    }
    stampPatientOrganizationRequestContext({
      organizationId: patientContext.organizationId,
      platformUserId: session.user.userId,
      source: 'app.patient.layout',
    });
    const patientOrganizationId = patientContext.organizationId;
    // Host branding was resolved once in proxy. The clinic context title may consume that value
    // only when the branded Host and the enrollment-selected organization are the same tenant.
    const resolvedPatientBrand =
      resolvedSurface.surface === 'patient_branded' &&
      resolvedSurface.organizationId === patientOrganizationId
        ? resolvedSurface.effectivePatientBrand
        : null;
    const patientBrandingContext = {
      ...patientContext,
      organization: {
        ...patientContext.organization,
        title: resolvedPatientBrand?.effectiveDisplayName ?? patientContext.organization.title,
      },
    };
    if (!patientPathAllowsGlobalAccountWithoutCareContext(pathname)) {
      let cabinetBlocked = true;
      try {
        cabinetBlocked = isCabinetEntryBlocked(
          await deps.orgEntitlements.resolveCabinetAccess(patientOrganizationId),
        );
      } catch {
        // The organization product boundary fails closed while global account/switching stays open.
      }
      if (cabinetBlocked) redirect(routePaths.patientOrganizations);
    }
    const maintenance = await getPatientMaintenanceConfig(patientOrganizationId);
    const skipMaintenance = patientMaintenanceSkipsPath({
      pathname,
      gate,
      legacyNoDatabase: !databaseConfigured,
      sessionPhoneTrimmed: session.user.phone?.trim(),
    });

    let isTestAccount = false;
    if (maintenance.enabled && !skipMaintenance) {
      try {
        isTestAccount = await deps.systemSettings.isCurrentPatientTestAccount();
      } catch (err) {
        logger.warn({
          scope: 'patient_layout',
          event: 'patient_test_account_check_failed',
          error: err instanceof Error ? err.message : String(err),
        });
        isTestAccount = false;
      }
    }

    if (
      patientMaintenanceReplacesPatientShell(maintenance.enabled, skipMaintenance, isTestAccount)
    ) {
      let upcoming: PatientMaintenanceBooking[] = [];
      try {
        const records = await deps.patientMaintenanceHistory.listCurrentPatientHistory();
        upcoming = selectMaintenanceUpcomingBookings(records);
      } catch (err) {
        logger.warn({
          scope: 'patient_layout',
          event: 'patient_maintenance_bookings_failed',
          error: err instanceof Error ? err.message : String(err),
        });
      }

      const appDisplayTimeZone = await getAppDisplayTimeZone();

      return (
        <PatientClientLayout
          organizationContext={patientBrandingContext}
          authChannelPolicy={authChannelPolicy}
          materialRatingsEnabled={materialRatingsEnabled}
        >
          <PatientMaintenanceScreen
            user={session.user}
            message={maintenance.message}
            bookingUrl={maintenance.bookingUrl}
            bookings={upcoming}
            appDisplayTimeZone={appDisplayTimeZone}
          />
        </PatientClientLayout>
      );
    }
    return (
      <PatientClientLayout
        organizationContext={patientBrandingContext}
        rememberOrganizationOnMount={patientContext.selectedBy === 'only_active'}
        authChannelPolicy={authChannelPolicy}
        materialRatingsEnabled={materialRatingsEnabled}
      >
        {children}
      </PatientClientLayout>
    );
  }

  return (
    <PatientClientLayout
      authChannelPolicy={authChannelPolicy}
      materialRatingsEnabled={materialRatingsEnabled}
    >
      {children}
    </PatientClientLayout>
  );
}
