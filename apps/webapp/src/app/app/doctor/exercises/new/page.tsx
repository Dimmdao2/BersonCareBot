import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { AppShell } from "@/shared/ui/AppShell";
import { ExerciseForm } from "../ExerciseForm";

export default async function DoctorExerciseNewPage() {
  const session = await requireDoctorAccess();

  return (
    <AppShell title="Новое упражнение" user={session.user} variant="doctor" backHref="/app/doctor/exercises">
      <section className="rounded-lg border border-border bg-card p-4 shadow-sm flex flex-col gap-4">
        <ExerciseForm />
      </section>
    </AppShell>
  );
}
