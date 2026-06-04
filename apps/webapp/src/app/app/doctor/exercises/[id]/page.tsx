import { notFound } from "next/navigation";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { AppShell } from "@/shared/ui/AppShell";
import { doctorCatalogEditorSectionClass } from "@/shared/ui/doctorVisual";
import { ExerciseForm } from "../ExerciseForm";

type PageProps = { params: Promise<{ id: string }> };

export default async function DoctorExerciseEditPage({ params }: PageProps) {
  const session = await requireDoctorAccess();
  const { id } = await params;
  const deps = buildAppDeps();
  const exercise = await deps.lfkExercises.getExercise(id);
  if (!exercise) {
    notFound();
  }
  const usage = await deps.lfkExercises.getExerciseUsage(exercise.id);

  return (
    <AppShell
      title="Редактирование упражнения"
      user={session.user}
      variant="doctor"
      backHref="/app/doctor/exercises"
    >
      <section className={doctorCatalogEditorSectionClass}>
        <ExerciseForm exercise={exercise} externalUsageSnapshot={usage} />
      </section>
    </AppShell>
  );
}
