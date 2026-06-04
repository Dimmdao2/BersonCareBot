import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { DoctorAppShell } from "@/shared/ui/doctor/DoctorAppShell";
import { AutoCreateExercisesClient } from "../AutoCreateExercisesClient";

export default async function DoctorExercisesAutoCreatePage() {
  const session = await requireDoctorAccess();
  return (
    <DoctorAppShell title="Автосоздание упражнений" user={session.user} backHref="/app/doctor/exercises">
      <AutoCreateExercisesClient />
    </DoctorAppShell>
  );
}
