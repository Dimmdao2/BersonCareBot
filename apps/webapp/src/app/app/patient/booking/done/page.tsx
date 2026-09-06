import { redirect } from 'next/navigation';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { getOptionalPatientSession } from '@/app-layer/guards/requireRole';
import { withPatientOrganizationPrincipal } from '@/app-layer/principal/withOrganizationPrincipal';
import { routePaths } from '@/app-layer/routes/paths';
import { env } from '@/config/env';
import { getAppDisplayTimeZone } from '@/modules/system-settings/appDisplayTimezone';
import { BookingWizardShell } from '../BookingWizardShell';
import { BookingDoneClient } from './BookingDoneClient';
import { bookingNewHref } from '../bookingNewHref';
import { resolvePatientOrganizationIdForRsc } from '../bookingCatalogRsc';

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

  const locationLabel = first(raw.locationLabel)?.trim() ?? '';
  const cityCode = first(raw.cityCode)?.trim();
  const backToHubHref = bookingNewHref(cityCode);
  const appDisplayTimeZone = await getAppDisplayTimeZone();

  // Never trust `locationLabel`/`cityCode` query params for the branch's own timezone: resolve the
  // canonical `be_branches.timezone` from the just-confirmed booking's own read path instead
  // (`canonicalInPersonContext`, same field the cabinet booking lists already carry).
  const deps = buildAppDeps();
  const organizationId = await resolvePatientOrganizationIdForRsc(deps, session.user.userId);
  const branchTimeZone = organizationId
    ? await withPatientOrganizationPrincipal(
        {
          organizationId,
          platformUserId: session.user.userId,
          source: 'app/patient/booking:load-done-branch-timezone',
        },
        async () => {
          const booking = await deps.patientBooking.getBookingForUser(
            bookingId,
            session.user.userId,
          );
          return booking?.canonicalInPersonContext?.timezone ?? null;
        },
      ).catch(() => null)
    : null;

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
        branchTimeZone={branchTimeZone}
        appBaseUrl={env.APP_BASE_URL}
      />
    </BookingWizardShell>
  );
}
