import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { AppShell } from "@/shared/ui/AppShell";
import { LfkTemplateNewStandalone } from "./LfkTemplateNewStandalone";

export default async function DoctorLfkTemplateNewPage() {
  const session = await requireDoctorAccess();
  const deps = buildAppDeps();
  const exercises = await deps.lfkExercises.listExercises({ includeArchived: false });
  const exerciseCatalog = exercises.map((e) => ({
    id: e.id,
    title: e.title,
    firstMedia: e.media[0] ?? null,
  }));

  return (
    <AppShell
      title="Новый комплекс"
      user={session.user}
      variant="doctor"
      backHref="/app/doctor/lfk-templates"
    >
      <LfkTemplateNewStandalone exerciseCatalog={exerciseCatalog} />
    </AppShell>
  );
}
