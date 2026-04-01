import { redirect } from "next/navigation";
import { getOptionalPatientSession } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";
import { BookingWizardShell } from "../BookingWizardShell";
import { ServiceStepClient } from "./ServiceStepClient";

type Props = {
  searchParams: Promise<{ cityCode?: string; cityTitle?: string }>;
};

export default async function BookingNewServicePage({ searchParams }: Props) {
  const session = await getOptionalPatientSession();
  if (!session) {
    redirect(routePaths.patient);
  }

  const sp = await searchParams;
  const cityCode = sp.cityCode?.trim();
  const cityTitle = sp.cityTitle ?? "";
  if (!cityCode) {
    redirect(routePaths.bookingNewCity);
  }

  return (
    <BookingWizardShell
      title="Выберите услугу"
      step={3}
      totalSteps={5}
      backHref={routePaths.bookingNewCity}
      user={session.user}
    >
      <ServiceStepClient cityCode={cityCode} cityTitle={cityTitle} />
    </BookingWizardShell>
  );
}
