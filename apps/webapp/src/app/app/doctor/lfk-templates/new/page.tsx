import { requireDoctorWorkspaceContext } from '@/app-layer/guards/requireRole';
import { requireEntitlementForReadAction } from '@/app-layer/guards/requireEntitlement';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { DoctorAppShell } from '@/shared/ui/doctor/DoctorAppShell';
import { LfkTemplateNewStandalone } from './LfkTemplateNewStandalone';

export default async function DoctorLfkTemplateNewPage() {
  const workspace = await requireDoctorWorkspaceContext();
  const session = workspace.session;
  const deps = buildAppDeps();
  const includePlatformBase = (await requireEntitlementForReadAction(workspace, 'exercise_catalog'))
    .ok;
  const exercises = await deps.lfkExercises.listExercises({
    includeArchived: false,
    includePlatformBase,
  });
  const exerciseCatalog = exercises.map((e) => ({
    id: e.id,
    title: e.title,
    firstMedia: e.media[0] ?? null,
  }));

  return (
    <DoctorAppShell title="Новый комплекс" user={session.user} backHref="/app/doctor/lfk-templates">
      <LfkTemplateNewStandalone exerciseCatalog={exerciseCatalog} />
    </DoctorAppShell>
  );
}
