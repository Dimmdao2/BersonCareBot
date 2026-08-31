import { notFound } from 'next/navigation';
import { requireDoctorWorkspaceContext } from '@/app-layer/guards/requireRole';
import { requireEntitlementForReadAction } from '@/app-layer/guards/requireEntitlement';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { DoctorAppShell } from '@/shared/ui/doctor/DoctorAppShell';
import { doctorCatalogEditorSectionClass } from '@/shared/ui/doctor/doctorVisual';
import { ExerciseForm } from '../ExerciseForm';
import { EXERCISE_LOAD_TYPE_CATEGORY_CODE } from '@/modules/lfk-exercises/exerciseLoadTypeReference';

type PageProps = { params: Promise<{ id: string }> };

export default async function DoctorExerciseEditPage({ params }: PageProps) {
  const workspace = await requireDoctorWorkspaceContext();
  const session = workspace.session;
  const { id } = await params;
  const deps = buildAppDeps();
  const includePlatformBase = (await requireEntitlementForReadAction(workspace, 'exercise_catalog'))
    .ok;
  const [exercise, bodyRegionItems, loadTypeItems] = await Promise.all([
    deps.lfkExercises.getExercise(id, { includePlatformBase }),
    deps.references.listActiveItemsByCategoryCode('body_region'),
    deps.references.listActiveItemsByCategoryCode(EXERCISE_LOAD_TYPE_CATEGORY_CODE),
  ]);
  if (!exercise) {
    notFound();
  }
  const usage =
    exercise.ownerKind === 'organization'
      ? await deps.lfkExercises.getExerciseUsage(exercise.id)
      : undefined;

  return (
    <DoctorAppShell
      title="Редактирование упражнения"
      user={session.user}
      backHref="/app/doctor/exercises"
    >
      <section className={doctorCatalogEditorSectionClass}>
        <ExerciseForm
          exercise={exercise}
          externalUsageSnapshot={usage}
          bodyRegionItems={bodyRegionItems}
          loadTypeItems={loadTypeItems}
        />
      </section>
    </DoctorAppShell>
  );
}
