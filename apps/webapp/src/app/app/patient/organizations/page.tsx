import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requirePatientAccess } from '@/app-layer/guards/requireRole';
import { resolvePatientOrganizationRequestContext } from '@/app-layer/patient-organization/requestContext';
import { routePaths } from '@/app-layer/routes/paths';
import { PatientAppShell } from '@/shared/ui/patient/PatientAppShell';
import { PatientOrganizationRelationships } from '@/shared/ui/patient/organization/PatientOrganizationRelationships';
import {
  patientInnerPageStackClass,
  patientMutedTextClass,
  patientSectionSurfaceClass,
  patientSectionTitleClass,
} from '@/shared/ui/patient/patientVisual';

export default async function PatientOrganizationsPage({
  searchParams,
}: {
  searchParams: Promise<{ unavailable?: string; reason?: string }>;
}) {
  const session = await requirePatientAccess(routePaths.patientOrganizations);
  const query = await searchParams;
  const context = await resolvePatientOrganizationRequestContext(
    buildAppDeps().patientOrganization,
    session.user.userId,
  );

  const organizations = context.ok
    ? context.organizations
    : context.reason === 'organization_selection_required'
      ? context.organizations
      : [];
  const currentOrganizationId = context.ok ? context.organizationId : null;
  const invalidRememberedOrganization =
    !context.ok &&
    context.reason === 'organization_selection_required' &&
    context.invalidRememberedOrganization;

  return (
    <PatientAppShell
      title="Мои организации"
      user={session.user}
      backHref={routePaths.profile}
      backLabel="Профиль"
    >
      <div className={patientInnerPageStackClass}>
        <section id="patient-organizations-list" className={patientSectionSurfaceClass}>
          <h2 className={patientSectionTitleClass}>Доступные организации</h2>
          <p className={patientMutedTextClass}>
            Выберите организацию, данные которой хотите открыть.
          </p>
          <div className="mt-4">
            <PatientOrganizationRelationships
              organizations={organizations}
              currentOrganizationId={currentOrganizationId}
              invalidRememberedOrganization={invalidRememberedOrganization}
              destinationUnavailable={
                query.unavailable === '1' || query.reason === 'organization_unavailable'
              }
              reminderTargetMissing={query.reason === 'reminder_target_missing'}
            />
          </div>
        </section>
      </div>
    </PatientAppShell>
  );
}
