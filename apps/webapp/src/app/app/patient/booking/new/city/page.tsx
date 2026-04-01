import { redirect } from "next/navigation";
import { getOptionalPatientSession } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";
import { BookingWizardShell } from "../BookingWizardShell";
import { CityStepClient } from "./CityStepClient";

export default async function BookingNewCityPage() {
  const session = await getOptionalPatientSession();
  if (!session) {
    redirect(routePaths.patient);
  }

  return (
    <BookingWizardShell
      title="Выберите город"
      step={2}
      totalSteps={5}
      backHref={routePaths.bookingNew}
      user={session.user}
    >
      <CityStepClient />
    </BookingWizardShell>
  );
}
