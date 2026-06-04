import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { AppShell } from "@/shared/ui/AppShell";
import { doctorCatalogEditorSectionClass } from "@/shared/ui/doctorVisual";
import { ExerciseForm } from "../ExerciseForm";

export default async function DoctorExerciseNewPage() {
  const session = await requireDoctorAccess();

  return (
    <AppShell title="Новое упражнение" user={session.user} variant="doctor" backHref="/app/doctor/exercises">
      <section className={doctorCatalogEditorSectionClass}>
        <ExerciseForm />
      </section>
    </AppShell>
  );
}
