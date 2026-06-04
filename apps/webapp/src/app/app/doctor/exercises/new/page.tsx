import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { DoctorAppShell } from "@/shared/ui/doctor/DoctorAppShell";
import { doctorCatalogEditorSectionClass } from "@/shared/ui/doctor/doctorVisual";
import { ExerciseForm } from "../ExerciseForm";

export default async function DoctorExerciseNewPage() {
  const session = await requireDoctorAccess();

  return (
    <DoctorAppShell title="Новое упражнение" user={session.user} backHref="/app/doctor/exercises">
      <section className={doctorCatalogEditorSectionClass}>
        <ExerciseForm />
      </section>
    </DoctorAppShell>
  );
}
