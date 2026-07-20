import { notFound } from "next/navigation";
import { requireDoctorWorkspaceContext } from "@/app-layer/guards/requireRole";
import { assertMechanicEnabled } from "@/app-layer/guards/requireEntitlement";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { DoctorAppShell } from "@/shared/ui/doctor/DoctorAppShell";
import { doctorCatalogEditorSectionClass } from "@/shared/ui/doctor/doctorVisual";
import { ExerciseForm } from "../ExerciseForm";

type PageProps = { params: Promise<{ id: string }> };

export default async function DoctorExerciseEditPage({ params }: PageProps) {
  const workspace = await requireDoctorWorkspaceContext();
  const session = workspace.session;
  const { id } = await params;
  const deps = buildAppDeps();
  const includePlatformBase = await assertMechanicEnabled(workspace.organizationId, "exercise_catalog");
  const exercise = await deps.lfkExercises.getExercise(id, { includePlatformBase });
  if (!exercise) {
    notFound();
  }
  const usage = exercise.ownerKind === "organization" ? await deps.lfkExercises.getExerciseUsage(exercise.id) : undefined;

  return (
    <DoctorAppShell
      title="Редактирование упражнения"
      user={session.user}
     
      backHref="/app/doctor/exercises"
    >
      <section className={doctorCatalogEditorSectionClass}>
        <ExerciseForm exercise={exercise} externalUsageSnapshot={usage} />
      </section>
    </DoctorAppShell>
  );
}
