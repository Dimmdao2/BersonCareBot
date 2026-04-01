import { redirect } from "next/navigation";
import { getOptionalPatientSession } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";
import { BookingWizardShell } from "./BookingWizardShell";
import { FormatStepClient } from "./FormatStepClient";

export default async function BookingNewFormatPage() {
  const session = await getOptionalPatientSession();
  if (!session) {
    redirect(routePaths.patient);
  }

  return (
    <BookingWizardShell
      title="Запись на приём"
      step={1}
      totalSteps={5}
      backHref={routePaths.cabinet}
      user={session.user}
    >
      <FormatStepClient />
    </BookingWizardShell>
  );
}
