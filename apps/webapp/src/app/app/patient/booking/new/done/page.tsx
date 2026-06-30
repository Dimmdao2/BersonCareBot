import { redirect } from "next/navigation";
import { getOptionalPatientSession } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";
import { getAppDisplayTimeZone } from "@/modules/system-settings/appDisplayTimezone";
import { BookingWizardShell } from "../BookingWizardShell";
import { BookingDoneClient } from "./BookingDoneClient";
import { bookingNewHref } from "../../bookingNewHref";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function first(v: string | string[] | undefined): string | undefined {
  if (v === undefined) return undefined;
  return Array.isArray(v) ? v[0] : v;
}

export default async function BookingNewDonePage({ searchParams }: Props) {
  const session = await getOptionalPatientSession();
  if (!session) {
    redirect(routePaths.patient);
  }

  const raw = await searchParams;

  const bookingId = first(raw.bookingId)?.trim();
  const slotStart = first(raw.slotStart)?.trim();
  const slotEnd = first(raw.slotEnd)?.trim();
  const serviceTitle = first(raw.serviceTitle)?.trim();

  // Required params — if absent, the user navigated here directly; bounce to hub.
  if (!bookingId || !slotStart || !slotEnd || !serviceTitle) {
    redirect(routePaths.bookingNew);
  }

  const locationLabel = first(raw.locationLabel)?.trim() ?? "";
  const cityCode = first(raw.cityCode)?.trim();
  const backToHubHref = bookingNewHref(cityCode);
  const appDisplayTimeZone = await getAppDisplayTimeZone();

  return (
    <BookingWizardShell
      title="Запись подтверждена"
      step={4}
      totalSteps={4}
      backHref={null}
      user={session.user}
    >
      <BookingDoneClient
        slotStart={slotStart}
        slotEnd={slotEnd}
        serviceTitle={serviceTitle}
        locationLabel={locationLabel}
        bookingId={bookingId}
        backToHubHref={backToHubHref}
        appDisplayTimeZone={appDisplayTimeZone}
      />
    </BookingWizardShell>
  );
}
