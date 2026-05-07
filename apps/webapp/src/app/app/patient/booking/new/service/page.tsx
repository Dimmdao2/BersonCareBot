import { redirect } from "next/navigation";
import { getOptionalPatientSession } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";
import { loadBookingServicesForPatientRsc } from "../../bookingCatalogRsc";
import { BOOKING_WIZARD_TOTAL_STEPS } from "../../constants";
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

  const servicesCatalog = await loadBookingServicesForPatientRsc(cityCode);
  if (!servicesCatalog.ok && servicesCatalog.error === "city_not_found") {
    redirect(routePaths.bookingNew);
  }
  const catalogServices = servicesCatalog.ok ? servicesCatalog.services : [];
  const catalogServicesError = servicesCatalog.ok
    ? null
    : "Не удалось загрузить услуги. Попробуйте ещё раз.";

  return (
    <BookingWizardShell
      title="Выберите услугу"
      step={2}
      totalSteps={BOOKING_WIZARD_TOTAL_STEPS}
      backHref={routePaths.bookingNew}
      user={session.user}
    >
      <ServiceStepClient
        cityCode={cityCode}
        cityTitle={cityTitle}
        services={catalogServices}
        catalogError={catalogServicesError}
      />
    </BookingWizardShell>
  );
}
