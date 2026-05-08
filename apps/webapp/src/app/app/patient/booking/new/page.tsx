import Link from "next/link";
import { Calendar } from "lucide-react";
import { redirect } from "next/navigation";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { getOptionalPatientSession } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";
import { getAppDisplayTimeZone } from "@/modules/system-settings/appDisplayTimezone";
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
        <div className="flex min-w-0 items-center gap-3">
          <Calendar className="size-6 shrink-0 text-[var(--patient-color-primary)]" aria-hidden />
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
        <p className="mt-10 mb-10 text-center text-sm">
          <Link
            href={routePaths.patientMessages}
            prefetch={false}
            className={cn(
              "font-normal underline-offset-2 hover:underline",
              "text-[#5c6ba8] hover:text-[#4a5690]",
              "focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#a5b4ea]",
            )}
          >
            Задать вопрос
          </Link>
        </p>
        <BookingPastHistorySection items={pastItems} appDisplayTimeZone={appDisplayTimeZone} />
        <LegalFooterLinks className="mt-6 pb-8" />
      </div>
    </BookingWizardShell>
  );
}
