import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requireEntitlementForMutationPage } from '@/app-layer/guards/requireEntitlement';
import { logServerRuntimeError } from '@/infra/logging/serverRuntimeLog';
import { requireDoctorWorkspaceContext } from '@/app-layer/guards/requireRole';
import { withDoctorWorkspacePrincipal } from '@/app-layer/principal/withOrganizationPrincipal';
import { DoctorAppShell } from '@/shared/ui/doctor/DoctorAppShell';
import { doctorCatalogEditorSectionClass } from '@/shared/ui/doctor/doctorVisual';
import { DataLoadFailureNotice } from '@/shared/ui/doctor/DataLoadFailureNotice';
import {
  parsePatientHomeCmsReturnQuery,
  PATIENT_HOME_CMS_DEFAULT_RETURN_PATH,
  type PatientHomeCmsReturnQuery,
} from '@/modules/patient-home/patientHomeCmsReturnUrls';
import type { PatientHomeCmsBlockCode } from '@/modules/patient-home/blocks';
import { DoctorCourseDraftCreateForm } from './DoctorCourseDraftCreateForm';

function pick(sp: Record<string, string | string[] | undefined>, key: string): string | undefined {
  const v = sp[key];
  return typeof v === 'string' ? v : Array.isArray(v) ? v[0] : undefined;
}

export default async function DoctorCoursesNewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const workspace = await requireDoctorWorkspaceContext();
  await requireEntitlementForMutationPage({ organizationId: workspace.organizationId }, 'courses');
  const sp = await searchParams;
  const returnContext: PatientHomeCmsReturnQuery = parsePatientHomeCmsReturnQuery({
    returnTo: pick(sp, 'returnTo'),
    patientHomeBlock: pick(sp, 'patientHomeBlock'),
  }) ?? {
    returnTo: PATIENT_HOME_CMS_DEFAULT_RETURN_PATH,
    patientHomeBlock: 'courses' as PatientHomeCmsBlockCode,
  };

  const deps = buildAppDeps();
  let templates: { id: string; title: string; status: string }[] = [];
  let loadError: ReturnType<typeof logServerRuntimeError> | null = null;
  try {
    const rows = await withDoctorWorkspacePrincipal(workspace, 'app.doctor.courses.picker', () =>
      deps.treatmentProgram.listTemplates({}),
    );
    templates = rows.map((r) => ({ id: r.id, title: r.title, status: r.status }));
  } catch (err) {
    loadError = logServerRuntimeError('app/doctor/courses/new', err);
  }

  const isDev = process.env.NODE_ENV === 'development';

  return (
    <DoctorAppShell
      title="Новый курс (черновик)"
      user={workspace.session.user}
      backHref={returnContext.returnTo}
      backLabel="Назад"
    >
      <section className={doctorCatalogEditorSectionClass}>
        {loadError ? (
          <DataLoadFailureNotice
            digest={loadError.digest}
            devMessage={isDev ? `${loadError.name}: ${loadError.message}` : undefined}
          />
        ) : null}
        <DoctorCourseDraftCreateForm templates={templates} returnContext={returnContext} />
      </section>
    </DoctorAppShell>
  );
}
