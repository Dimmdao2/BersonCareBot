import { notFound } from 'next/navigation';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requirePatientWorkspaceModuleForApi } from '@/app-layer/guards/workspaceModuleAccess';
import { routePaths } from '@/app-layer/routes/paths';
import { getCurrentSession } from '@/modules/auth/service';
import { pickActivePlanInstance } from '@/modules/treatment-program/pickActivePlanInstance';
import { withPatientOrganizationPrincipal } from '@/app-layer/principal/withOrganizationPrincipal';
import { PatientDiaryAuthenticatedMain } from '../../diary/PatientDiaryAuthenticatedMain';
import { PatientTreatmentProgramsListClient } from '../../treatment/PatientTreatmentProgramsListClient';
import { PatientLiveMeetingClient } from './PatientLiveMeetingClient';

async function PatientLiveProgramPanel({
  userId,
  organizationId,
}: {
  userId: string;
  organizationId: string;
}) {
  const programs = await withPatientOrganizationPrincipal(
    { organizationId, platformUserId: userId, source: 'app.patient.live.program-panel' },
    () => buildAppDeps().treatmentProgramInstance.listForPatient(userId),
  );
  const active = pickActivePlanInstance(programs);
  return (
    <PatientTreatmentProgramsListClient
      hero={
        active
          ? {
              instanceId: active.id,
              title: active.title,
              currentStageTitle: null,
              planUpdatedLabel: null,
            }
          : null
      }
      archived={programs.filter((program) => program.status === 'completed')}
      messagesHref={routePaths.patientMessages}
    />
  );
}

export default async function PatientLiveMeetingPage({ params }: { params: Promise<{ meetingId: string }> }) {
  const { meetingId } = await params;
  if (!z.string().uuid().safeParse(meetingId).success) notFound();
  const session = await getCurrentSession();
  const deps = buildAppDeps();
  const clientPortal = session
    ? await requirePatientWorkspaceModuleForApi(deps, session.user.userId, 'client_portal')
    : null;
  const patientPanelProps =
    clientPortal?.ok
      ? {
          diaryPanel: (
            <PatientDiaryAuthenticatedMain
              userId={session!.user.userId}
              organizationId={clientPortal.organizationId}
              rehabilitationEnabled={clientPortal.modules.rehabilitation}
            />
          ),
          programPanel: clientPortal.modules.rehabilitation ? (
            <PatientLiveProgramPanel
              userId={session!.user.userId}
              organizationId={clientPortal.organizationId}
            />
          ) : undefined,
        }
      : {};
  return <PatientLiveMeetingClient meetingId={meetingId} {...patientPanelProps} />;
}
