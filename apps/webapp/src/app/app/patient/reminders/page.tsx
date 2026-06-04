import { Suspense } from "react";
import { requirePatientAccessWithPhone } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";
import { PatientAppShell } from "@/shared/ui/patient/PatientAppShell";
import { PatientLoadingPatternBody } from "@/shared/ui/patient/patientVisual";
import { RemindersPageBody } from "./RemindersPageBody";

export default async function RemindersPage() {
  const session = await requirePatientAccessWithPhone(routePaths.patientReminders);

  return (
    <PatientAppShell
      title="Расписание напоминаний"
      user={session.user}
      backHref={routePaths.profile}
      backLabel="Назад"
     
    >
      <Suspense fallback={<PatientLoadingPatternBody pattern="cardBlocks" />}>
        <RemindersPageBody session={session} />
      </Suspense>
    </PatientAppShell>
  );
}
