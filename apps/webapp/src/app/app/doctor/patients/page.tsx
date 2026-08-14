/**
 * /app/doctor/patients — список пациентов врача.
 * Pattern: follows exercises/page.tsx (workspace guard → buildAppDeps → pass promise to Client).
 */
import { requireDoctorWorkspaceContext } from '@/app-layer/guards/requireRole';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { DoctorAppShell } from '@/shared/ui/doctor/DoctorAppShell';
import { getAppDisplayTimeZone } from '@/modules/system-settings/appDisplayTimezone';
import { resolvePatientTerms } from '@/modules/system-settings/patientTerms';
import { PatientsPageClient } from './PatientsPageClient';
import { parsePatientListWorkspaceState } from './patientListWorkspaceState';

function getValueJson<T>(v: unknown, fallback: T): T {
  if (v !== null && typeof v === 'object' && 'value' in (v as Record<string, unknown>)) {
    return (v as Record<string, unknown>).value as T;
  }
  return fallback;
}

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function DoctorPatientsPage({ searchParams }: PageProps) {
  const workspace = await requireDoctorWorkspaceContext();
  const session = workspace.session;
  const sp = (await searchParams) ?? {};
  const initialFilters = parsePatientListWorkspaceState(sp);

  const deps = buildAppDeps();

  const displayIana = await getAppDisplayTimeZone();

  const doctorSettings = await deps.systemSettings.listSettingsByScope('doctor', {
    organizationId: workspace.organizationId,
  });
  const patientSingular = getValueJson(
    doctorSettings.find((x) => x.key === 'patient_label')?.valueJson,
    'пациент',
  );
  const { patientPluralLabel, patientSingularLabel } = resolvePatientTerms(String(patientSingular));

  const listPromise = deps.doctorClients.listClients({
    // PAT-10: search is done client-side — do not pass q to DB
    archivedOnly: initialFilters.archivedOnly,
    organizationId: workspace.organizationId,
    visibilityActor: workspace,
    viewerUserId: session.user.userId,
    // Segment and channel filters are applied client-side so toggles do not reload the list.
  });

  const metricsPromise = deps.doctorClientsPort.getDashboardPatientMetrics({
    organizationId: workspace.organizationId,
    visibilityActor: workspace,
  });

  return (
    <DoctorAppShell title={patientPluralLabel} user={session.user} layout="full-height">
      <PatientsPageClient
        listPromise={listPromise}
        metricsPromise={metricsPromise}
        initialFilters={initialFilters}
        patientPluralLabel={patientPluralLabel}
        patientSingularLabel={patientSingularLabel}
        displayIana={displayIana}
      />
    </DoctorAppShell>
  );
}
