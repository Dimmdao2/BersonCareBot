import { requireDoctorWorkspaceContext } from '@/app-layer/guards/requireRole';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import {
  getMechanicMutationAvailability,
  requireEntitlementForPage,
} from '@/app-layer/guards/requireEntitlement';
import { DoctorAppShell } from '@/shared/ui/doctor/DoctorAppShell';
import { DoctorPageHeader } from '@/shared/ui/doctor/shell/DoctorPageHeader';
import { DefaultPromoProgramClient } from './DefaultPromoProgramClient';

export default async function DoctorTreatmentProgramPromoPage() {
  const workspace = await requireDoctorWorkspaceContext();
  await requireEntitlementForPage(workspace, 'promo');
  const session = workspace.session;
  const deps = buildAppDeps();

  const [templates, currentId, activePromo, completedPromo, mutationAvailability] = await Promise.all([
    deps.treatmentProgram.listTemplates({ status: 'published' }),
    deps.systemSettings.getPatientDefaultPromoTreatmentProgramTemplateId({
      organizationId: workspace.organizationId,
    }),
    deps.treatmentProgramInstance.countInstancesForAssignmentSource({
      assignmentSource: 'promo',
      status: 'active',
    }),
    deps.treatmentProgramInstance.countInstancesForAssignmentSource({
      assignmentSource: 'promo',
      status: 'completed',
    }),
    getMechanicMutationAvailability(workspace, 'promo'),
  ]);

  return (
    <DoctorAppShell title="Промо-программа" user={session.user} backHref="/app/doctor">
      <DoctorPageHeader
        id="doctor-treatment-program-promo-header"
        title="Промо-программа по умолчанию"
      />
      <DefaultPromoProgramClient
        initialTemplateId={currentId ?? ''}
        templates={templates.map((t) => ({ id: t.id, title: t.title.trim() || t.id }))}
        stats={{ activePromo, completedPromo }}
        canMutate={mutationAvailability.available}
      />
    </DoctorAppShell>
  );
}
