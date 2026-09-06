/**
 * /app/doctor/analytics — tenant/visibility-scoped doctor analytics (AN-ROUTE-01).
 *
 * Ordinary specialist and clinic admin both land here (clinical.workspace gate); global admin
 * never reaches this route (`requireDoctorWorkspaceContext` → `requireOrganizationWorkspaceContext`
 * redirects a `platform.operations` account to `/app/admin/system-health` before this page runs).
 * Platform-wide analytics lives at `/app/admin/analytics`.
 */
import { DateTime } from 'luxon';
import { requireDoctorWorkspaceContext } from '@/app-layer/guards/requireRole';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { getAppDisplayTimeZone } from '@/modules/system-settings/appDisplayTimezone';
import { resolvePatientTerms } from '@/modules/system-settings/patientTerms';
import { DoctorAnalyticsShell } from './DoctorAnalyticsShell';
import { analyticsTabFromQuery } from './doctorAnalyticsTabs';

function getValueJson<T>(v: unknown, fallback: T): T {
  if (v !== null && typeof v === 'object' && 'value' in (v as Record<string, unknown>)) {
    return (v as Record<string, unknown>).value as T;
  }
  return fallback;
}

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function DoctorAnalyticsPage({ searchParams }: PageProps) {
  const workspace = await requireDoctorWorkspaceContext();
  const sp = (await searchParams) ?? {};
  const initialTab = analyticsTabFromQuery(typeof sp.tab === 'string' ? sp.tab : undefined);

  const deps = buildAppDeps();
  const displayIana = await getAppDisplayTimeZone();
  const calendarTodayYmd =
    DateTime.now().setZone(displayIana).toISODate() ?? DateTime.now().toUTC().toISODate() ?? '';

  const doctorSettings = await deps.systemSettings.listSettingsByScope('doctor', {
    organizationId: workspace.organizationId,
  });
  const patientSingular = getValueJson(
    doctorSettings.find((x) => x.key === 'patient_label')?.valueJson,
    'пациент',
  );
  const { patientGenPlural } = resolvePatientTerms(String(patientSingular));

  return (
    <DoctorAnalyticsShell
      initialTab={initialTab}
      calendarTodayYmd={calendarTodayYmd}
      displayIana={displayIana}
      patientGenPlural={patientGenPlural}
    />
  );
}
