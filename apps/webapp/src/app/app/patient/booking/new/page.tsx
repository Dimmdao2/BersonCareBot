import Link from "next/link";
import { redirect } from "next/navigation";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { getOptionalPatientSession } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";
import { getAppDisplayTimeZone } from "@/modules/system-settings/appDisplayTimezone";
import { patientHomePlanCardClass } from "@/app/app/patient/home/patientHomeCardStyles";
import { LegalFooterLinks } from "@/shared/ui/LegalFooterLinks";
import { cn } from "@/lib/utils";
import { patientInnerPageStackClass, patientSectionTitleClass } from "@/shared/ui/patientVisual";
import { mergePastBookingHistory } from "../../cabinet/cabinetPastBookingsMerge";
import { loadBookingCitiesForPatientRsc } from "../bookingCatalogRsc";
import { BOOKING_WIZARD_TOTAL_STEPS } from "../constants";
import { BookingPastHistorySection } from "./BookingPastHistorySection";
import { BookingUpcomingSection } from "./BookingUpcomingSection";
import { BookingWizardShell } from "./BookingWizardShell";
import { FormatStepClient } from "./FormatStepClient";

export const dynamic = "force-dynamic";

export default async function BookingNewFormatPage() {
  const session = await getOptionalPatientSession();
  if (!session) {
    redirect(routePaths.patient);
  }

  const deps = buildAppDeps();
  const records = await deps.patientBooking.listMyBookings(session.user.userId);
  const projectionPast = await deps.patientCabinet.getPastAppointments(session.user.userId);
  const pastItems = mergePastBookingHistory(records.history, projectionPast);
  const appDisplayTimeZone = await getAppDisplayTimeZone();

  const citiesCatalog = await loadBookingCitiesForPatientRsc();
  const catalogCities = citiesCatalog.ok ? citiesCatalog.cities : [];
  const catalogCitiesError = citiesCatalog.ok ? null : "Не удалось загрузить каталог городов. Попробуйте ещё раз.";

  return (
    <BookingWizardShell
      title=""
      shellTitleSlot={
        <div className="flex min-w-0 flex-col gap-8">
          <div className="-mx-4 w-[calc(100%+2rem)] min-w-0 max-w-none shrink-0">
            <div
              className={cn(
                patientHomePlanCardClass,
                "rounded-none border-0 text-sm font-light leading-snug md:rounded-none",
              )}
            >
              <span className="text-[#132a52]">
                Подробно обо мне и моих услугах вы можете почитать{" "}
              </span>
              <a
                href="https://dmitryberson.ru"
                target="_blank"
                rel="noopener noreferrer"
                className="font-light text-[var(--patient-color-primary)] underline decoration-[var(--patient-color-primary)] underline-offset-2"
              >
                на моём сайте
              </a>
            </div>
          </div>
          <h1 className={cn(patientSectionTitleClass, "min-w-0")}>Запись</h1>
        </div>
      }
      step={1}
      totalSteps={BOOKING_WIZARD_TOTAL_STEPS}
      backHref={routePaths.patient}
      user={session.user}
    >
      <div className={patientInnerPageStackClass}>
        <BookingUpcomingSection bookings={records.upcoming} appDisplayTimeZone={appDisplayTimeZone} />
        <FormatStepClient cities={catalogCities} catalogError={catalogCitiesError} />
        <div className="mt-10 mb-10 flex justify-center">
          <Link
            href={routePaths.patientMessages}
            prefetch={false}
            className={cn(
              "inline-flex min-h-10 shrink-0 cursor-pointer items-center justify-center rounded-lg border px-5 text-sm font-semibold transition-colors",
              "border-[#aeb8d8] bg-[var(--patient-card-bg)] text-[#394574]",
              "hover:border-[#98a6cf] hover:bg-[var(--patient-color-primary-soft)]/45 hover:text-[var(--patient-color-primary)]",
              "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--patient-color-primary)]",
            )}
          >
            Задать вопрос в чате
          </Link>
        </div>
        <BookingPastHistorySection items={pastItems} appDisplayTimeZone={appDisplayTimeZone} />
        <LegalFooterLinks className="mt-6 pb-8" />
      </div>
    </BookingWizardShell>
  );
}
