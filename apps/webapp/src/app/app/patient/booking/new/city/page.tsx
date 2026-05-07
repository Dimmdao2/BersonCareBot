import { redirect } from "next/navigation";
import { getOptionalPatientSession } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";
import { loadBookingCitiesForPatientRsc } from "../../bookingCatalogRsc";
import { BOOKING_WIZARD_TOTAL_STEPS } from "../../constants";
import { BookingWizardShell } from "../BookingWizardShell";
import { CityStepClient } from "./CityStepClient";

export default async function BookingNewCityPage() {
  const session = await getOptionalPatientSession();
  if (!session) {
    redirect(routePaths.patient);
  }

  const citiesCatalog = await loadBookingCitiesForPatientRsc();
  const catalogCities = citiesCatalog.ok ? citiesCatalog.cities : [];
  const catalogCitiesError = citiesCatalog.ok ? null : "Не удалось загрузить каталог городов. Попробуйте ещё раз.";

  return (
    <BookingWizardShell
      title="Выберите город"
      step={2}
      totalSteps={BOOKING_WIZARD_TOTAL_STEPS}
      backHref={routePaths.bookingNew}
      user={session.user}
    >
      <CityStepClient cities={catalogCities} catalogError={catalogCitiesError} />
    </BookingWizardShell>
  );
}
