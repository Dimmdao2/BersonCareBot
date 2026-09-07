/**
 * /app/doctor/analytics — tenant/visibility-scoped doctor analytics (AN-ROUTE-01).
 *
 * Ordinary specialist and clinic admin both land here (clinical.workspace gate); global admin
 * never reaches this route (`requireDoctorWorkspaceContext` → `requireOrganizationWorkspaceContext`
 * redirects a `platform.operations` account to `/app/admin/system-health` before this page runs).
 * Platform-wide analytics lives at `/app/admin/analytics`.
 */
import { DateTime } from 'luxon';
import { getAppDisplayTimeZone } from '@/modules/system-settings/appDisplayTimezone';
import { resolvePatientTerms } from '@/modules/system-settings/patientTerms';
import { requireWorkspaceModuleForPage } from '@/app-layer/guards/workspaceModuleAccess';
import { DoctorAnalyticsShell } from './DoctorAnalyticsShell';
import { analyticsTabFromQuery } from './doctorAnalyticsTabs';
import { loadDoctorWorkspaceShell } from '../loadDoctorWorkspaceShell';

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function DoctorAnalyticsPage({ searchParams }: PageProps) {
  const shell = await loadDoctorWorkspaceShell();
  requireWorkspaceModuleForPage(shell.workspaceModules.analytics);
  const sp = (await searchParams) ?? {};
  const initialTab = analyticsTabFromQuery(typeof sp.tab === 'string' ? sp.tab : undefined);

  const displayIana = await getAppDisplayTimeZone();
  const calendarTodayYmd =
    DateTime.now().setZone(displayIana).toISODate() ?? DateTime.now().toUTC().toISODate() ?? '';

  const { patientGenPlural } = resolvePatientTerms(shell.patientLabel);

  return (
    <DoctorAnalyticsShell
      initialTab={initialTab}
      calendarTodayYmd={calendarTodayYmd}
      displayIana={displayIana}
      patientGenPlural={patientGenPlural}
    />
  );
}
