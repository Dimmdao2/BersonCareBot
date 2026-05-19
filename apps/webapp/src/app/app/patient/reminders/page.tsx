import { Suspense } from "react";
import { requirePatientAccessWithPhone } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";
import { AppShell } from "@/shared/ui/AppShell";
import { PatientShellPageTitleWithHistoryBack } from "@/shared/ui/patient/PatientShellPageTitleWithHistoryBack";
import { PatientLoadingPatternBody } from "@/shared/ui/patientVisual";
import { RemindersPageBody } from "./RemindersPageBody";

export default async function RemindersPage() {
  const session = await requirePatientAccessWithPhone(routePaths.patientReminders);

  return (
    <AppShell
      title="Расписание напоминаний"
      user={session.user}
      backHref={routePaths.patient}
      backLabel="Меню"
      variant="patient"
      patientShellTitleSlot={
        <PatientShellPageTitleWithHistoryBack
          title="Расписание напоминаний"
          fallbackHref={routePaths.profile}
        />
      }
    >
      <Suspense fallback={<PatientLoadingPatternBody pattern="cardBlocks" />}>
        <RemindersPageBody session={session} />
      </Suspense>
    </AppShell>
  );
}
