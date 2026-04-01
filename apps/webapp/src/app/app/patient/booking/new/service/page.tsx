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
    redirect(routePaths.bookingNew);
  }

  return (
    <BookingWizardShell
      title="Выберите услугу"
      step={2}
      totalSteps={4}
      backHref={routePaths.bookingNew}
      user={session.user}
    >
      <ServiceStepClient cityCode={cityCode} cityTitle={cityTitle} />
    </BookingWizardShell>
  );
}
