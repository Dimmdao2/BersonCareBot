import { Suspense } from "react";
import { requirePatientAccessWithPhone } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";
import { AppShell } from "@/shared/ui/AppShell";
import { PatientLoadingPatternBody } from "@/shared/ui/patientVisual";
import { RemindersPageBody } from "./RemindersPageBody";

export default async function RemindersPage() {
  const session = await requirePatientAccessWithPhone(routePaths.patientReminders);

  return (
    <AppShell
      title="Напоминания"
      user={session.user}
      backHref={routePaths.patient}
      backLabel="Меню"
      variant="patient"
    >
      <Suspense fallback={<PatientLoadingPatternBody pattern="formRows" />}>
        <RemindersPageBody session={session} />
      </Suspense>
    </AppShell>
  );
}
