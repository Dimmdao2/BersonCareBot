import { requireDoctorAccess } from '@/app-layer/guards/requireRole';
import { DoctorAppShell } from '@/shared/ui/doctor/DoctorAppShell';
import { doctorCatalogEditorSectionClass } from '@/shared/ui/doctor/doctorVisual';
import { ExerciseForm } from '../ExerciseForm';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { EXERCISE_LOAD_TYPE_CATEGORY_CODE } from '@/modules/lfk-exercises/exerciseLoadTypeReference';

export default async function DoctorExerciseNewPage() {
  const session = await requireDoctorAccess();
  const deps = buildAppDeps();
  const [bodyRegionItems, loadTypeItems] = await Promise.all([
    deps.references.listActiveItemsByCategoryCode('body_region'),
    deps.references.listActiveItemsByCategoryCode(EXERCISE_LOAD_TYPE_CATEGORY_CODE),
  ]);

  return (
    <DoctorAppShell title="Новое упражнение" user={session.user} backHref="/app/doctor/exercises">
      <section className={doctorCatalogEditorSectionClass}>
        <ExerciseForm bodyRegionItems={bodyRegionItems} loadTypeItems={loadTypeItems} />
      </section>
    </DoctorAppShell>
  );
}
