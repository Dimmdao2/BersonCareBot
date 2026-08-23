import { notFound } from 'next/navigation';
import { DateTime } from 'luxon';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { loadDoctorAnalyticsAudience } from '@/app-layer/analytics/loadAnalyticsAudience';
import { withDoctorWorkspacePrincipal } from '@/app-layer/guards/doctorWorkspacePrincipal';
import {
  getMechanicMutationAvailability,
  requireEntitlementForReadAction,
} from '@/app-layer/guards/requireEntitlement';
import { requireDoctorWorkspaceContext } from '@/app-layer/guards/requireRole';
import { getAppDisplayTimeZone } from '@/modules/system-settings/appDisplayTimezone';
import { DoctorAppShell } from '@/shared/ui/doctor/DoctorAppShell';
import { loadDoctorOpenTasks } from '../loadDoctorOpenTasks';
import { DoctorTasksPageClient } from './DoctorTasksPageClient';

export default async function DoctorTasksPage() {
  const workspace = await requireDoctorWorkspaceContext();
  const deps = buildAppDeps();
  const [read, mutation, audience, displayIana] = await Promise.all([
    requireEntitlementForReadAction(workspace, 'specialist_tasks'),
    getMechanicMutationAvailability(workspace, 'specialist_tasks'),
    loadDoctorAnalyticsAudience(),
    getAppDisplayTimeZone(),
  ]);
  if (!read.ok) notFound();

  const data = await withDoctorWorkspacePrincipal(workspace, () =>
    loadDoctorOpenTasks({
      specialistTasks: deps.specialistTasks,
      ownerUserId: workspace.session.user.userId,
      doctorClients: deps.doctorClientsPort,
      doctorUserId: workspace.session.user.userId,
      organizationId: workspace.organizationId,
      visibilityActor: workspace,
      audience,
    }),
  );
  const todayIso = DateTime.now().setZone(displayIana).toISODate() ?? '';

  return (
    <DoctorAppShell title="Задачи" layout="full-height">
      <DoctorTasksPageClient
        initialTasks={data.tasks}
        initialPatientNames={data.patientNames}
        displayIana={displayIana}
        todayIso={todayIso}
        canMutate={mutation.available}
      />
    </DoctorAppShell>
  );
}
