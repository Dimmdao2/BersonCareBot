import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { AppShell } from "@/shared/ui/AppShell";
import { AutoCreateExercisesClient } from "../AutoCreateExercisesClient";

export default async function DoctorExercisesAutoCreatePage() {
  const session = await requireDoctorAccess();
  return (
    <AppShell title="Автосоздание упражнений" user={session.user} variant="doctor" backHref="/app/doctor/exercises">
      <AutoCreateExercisesClient />
    </AppShell>
  );
}
