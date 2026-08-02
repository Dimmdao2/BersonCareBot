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
import { env } from '@/config/env';
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
import { withPatientOrganizationPrincipal } from '@/app-layer/principal/withOrganizationPrincipal';
import { PatientOrganizationRecoveryScreen } from '@/shared/ui/patient/organization/PatientOrganizationContext';
import { getAuthChannelPolicy } from '@/modules/auth/authChannelPolicy';
import { isCabinetEntryBlocked } from '@/app-layer/guards/cabinetAccessGate';

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
  const h = await headers();
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

  const returnTo = (pathname.trim() ? pathname : routePaths.patient) + search;

  const gate = await patientClientBusinessGate(session);

  if (env.DATABASE_URL?.trim()) {
    if (gate === 'stale_session') {
      redirect(`${routePaths.root}?next=${encodeURIComponent(returnTo)}`);
    }
  } else if (!session.user.phone?.trim() && patientPathRequiresBoundPhone(pathname)) {
    redirect(`${routePaths.bindPhone}?next=${encodeURIComponent(returnTo)}`);
  }

  if (session.user.role === 'client') {
    const deps = buildAppDeps();
    const patientContext = await resolvePatientOrganizationRequestContext(
      deps.patientOrganization,
      session.user.userId,
    );
    if (!patientContext.ok) {
      if (patientPathAllowsGlobalAccountWithoutCareContext(pathname)) {
        return (
          <PatientClientLayout authChannelPolicy={authChannelPolicy}>
            {children}
          </PatientClientLayout>
        );
      }
      return (
        <PatientClientLayout authChannelPolicy={authChannelPolicy}>
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
    // The resolver receives only the enrollment-selected organization inside the patient principal;
    // it never accepts a client-controlled organization or brand. When branding is disabled it
    // returns the core title, which is the existing platform/default presentation of this context bar.
    const effectiveBranding = await withPatientOrganizationPrincipal(
      {
        organizationId: patientOrganizationId,
        platformUserId: session.user.userId,
        source: 'app.patient.layout.org-branding',
      },
      () => deps.orgBranding.resolveEffectiveOrgBranding(patientOrganizationId),
    ).catch(() => null);
    const patientBrandingContext = {
      ...patientContext,
      organization: {
        ...patientContext.organization,
        title: effectiveBranding?.effectiveDisplayName ?? patientContext.organization.title,
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
      legacyNoDatabase: !env.DATABASE_URL?.trim(),
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
      >
        {children}
      </PatientClientLayout>
    );
  }

  return (
    <PatientClientLayout authChannelPolicy={authChannelPolicy}>{children}</PatientClientLayout>
  );
}
