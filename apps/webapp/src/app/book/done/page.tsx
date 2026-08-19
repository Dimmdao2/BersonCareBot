import { redirect } from 'next/navigation';
import { env } from '@/config/env';
import { getAppDisplayTimeZone } from '@/modules/system-settings/appDisplayTimezone';
import { BookingDoneClient } from '@/app/app/patient/booking/done/BookingDoneClient';
import { publicBookPaths } from '@/shared/publicBook/paths';
import { PublicBookingShell } from '../PublicBookingShell';

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function first(v: string | string[] | undefined): string | undefined {
  if (v === undefined) return undefined;
  return Array.isArray(v) ? v[0] : v;
}

/**
 * Same success screen the signed-in patient app shows after a booking
 * (`app/app/patient/booking/done`) — reused as-is: `BookingDoneClient` takes only explicit props
 * and never reads a session. `ConfirmStepClient.onBookingCreated` (shared between the app and the
 * public wizard) already redirects here with `bookingId`/`slotStart`/`slotEnd`/`serviceTitle`/
 * `locationLabel` — this page only needed to read and render them, which it did not do before.
 */
export default async function PublicBookDonePage({ searchParams }: Props) {
  const raw = await searchParams;

  const bookingId = first(raw.bookingId)?.trim();
  const slotStart = first(raw.slotStart)?.trim();
  const slotEnd = first(raw.slotEnd)?.trim();
  const serviceTitle = first(raw.serviceTitle)?.trim();

  // Required params absent — the visitor navigated here directly; bounce to the entry point.
  if (!bookingId || !slotStart || !slotEnd || !serviceTitle) {
    redirect(publicBookPaths.new);
  }

  const locationLabel = first(raw.locationLabel)?.trim() ?? '';
  const appDisplayTimeZone = await getAppDisplayTimeZone();

  return (
    <PublicBookingShell title="Запись подтверждена" step={4} totalSteps={4} backHref={null}>
      <BookingDoneClient
        slotStart={slotStart}
        slotEnd={slotEnd}
        serviceTitle={serviceTitle}
        locationLabel={locationLabel}
        bookingId={bookingId}
        backToHubHref={publicBookPaths.new}
        appDisplayTimeZone={appDisplayTimeZone}
        appBaseUrl={env.APP_BASE_URL}
      />
    </PublicBookingShell>
  );
}
