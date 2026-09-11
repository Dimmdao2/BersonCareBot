import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentDbPrincipalOrganizationId } from '@bersoncare/db-principal';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import {
  getMechanicMutationAvailability,
  getMechanicSurfaceVisibility,
} from '@/app-layer/guards/requireEntitlement';
import { getOptionalPatientSession } from '@/app-layer/guards/requireRole';
import { routePaths } from '@/app-layer/routes/paths';
import { getAppDisplayTimeZone } from '@/modules/system-settings/appDisplayTimezone';
import { patientHomePlanCardClass } from '@/app/app/patient/home/patientHomeCardStyles';
import { LegalFooterLinks } from '@/shared/ui/patient/LegalFooterLinks';
import { cn } from '@/lib/utils';
import {
  patientInnerPageStackClass,
  patientInlineLinkClass,
  patientPageTitleClass,
  patientSecondaryActionClass,
  patientSectionTitleClass,
} from '@/shared/ui/patient/patientVisual';
import { loadBookingCitiesForPatientRsc } from './bookingCatalogRsc';
import { BOOKING_WIZARD_TOTAL_STEPS } from './constants';
import { BookingPastHistorySection } from './BookingPastHistorySection';
import { BookingUpcomingSection } from './BookingUpcomingSection';
import { PatientBookingPaymentHistorySection } from './PatientBookingPaymentHistorySection';
import { PatientMembershipsSection } from './PatientMembershipsSection';
import { BookingWizardShell } from './BookingWizardShell';
import {
  pickBookingCityCodeForAddressLinks,
  resolvePatientAddressHref,
} from '@/modules/help-content/patientHelpAddressLink';
import { listHelpArticlesForPatient } from '@/modules/help-content/listHelpArticles';
import { PatientAboutSiteLink } from '../about/PatientAboutSiteLink';
import { FormatStepClient } from './FormatStepClient';

export const dynamic = 'force-dynamic';

type PageProps = {
  searchParams: Promise<{ cityCode?: string }>;
};

function BookingFormatPromoBanner() {
  return (
    <div className="-mx-4 w-[calc(100%_+_2rem)] min-w-0 max-w-none shrink-0">
      <div className={cn(patientHomePlanCardClass, 'rounded-none border-0 md:rounded-none')}>
        <PatientAboutSiteLink />
      </div>
    </div>
  );
}

export default async function BookingNewFormatPage({ searchParams }: PageProps) {
  const session = await getOptionalPatientSession();
  if (!session) {
    redirect(routePaths.patient);
  }

  const { cityCode: cityCodeFromQuery } = await searchParams;
  const deps = buildAppDeps();
  const patientOrganization = deps.patientOrganization
    ? await deps.patientOrganization.resolveActiveOrganizationForPatient(session.user.userId, {
        rememberedOrganizationId: getCurrentDbPrincipalOrganizationId() ?? null,
      })
    : null;
  const membershipAccess = patientOrganization?.ok
    ? await getMechanicSurfaceVisibility(
        { organizationId: patientOrganization.organizationId },
        'subscriptions',
      )
    : null;
  const [membershipMutation, paymentsMutation] =
    patientOrganization?.ok && membershipAccess?.patientNavigation
      ? await Promise.all([
          getMechanicMutationAvailability(
            { organizationId: patientOrganization.organizationId },
            'subscriptions',
          ),
          getMechanicMutationAvailability(
            { organizationId: patientOrganization.organizationId },
            'payments',
          ),
        ])
      : [{ available: false as const }, { available: false as const }];
  const records = await deps.patientBooking.listMyBookings(session.user.userId);
  const bookingCityCode = pickBookingCityCodeForAddressLinks(
    cityCodeFromQuery,
    records.upcoming.map((b) => b.cityCodeSnapshot),
  );
  const appDisplayTimeZone = await getAppDisplayTimeZone();

  const helpArticles = await listHelpArticlesForPatient(deps.contentPages);
  const publishedHelpSlugs = new Set(helpArticles.map((a) => a.slug));
  const addressHref = resolvePatientAddressHref(publishedHelpSlugs, bookingCityCode);

  const citiesCatalog = await loadBookingCitiesForPatientRsc(session.user.userId);
  const catalogCities = citiesCatalog.ok ? citiesCatalog.cities : [];
  const onlineLocation = citiesCatalog.ok ? citiesCatalog.onlineLocation : null;
  const catalogCitiesError = citiesCatalog.ok
    ? null
    : 'Не удалось загрузить каталог городов. Попробуйте ещё раз.';

  return (
    <BookingWizardShell
      title="Запись"
      shellAboveTitleSlot={<BookingFormatPromoBanner />}
      shellTitleSlot={
        <div className="flex min-w-0 flex-col gap-8">
          <BookingFormatPromoBanner />
          <h1 className={cn(patientPageTitleClass, 'min-w-0')}>Запись</h1>
        </div>
      }
      step={1}
      totalSteps={BOOKING_WIZARD_TOTAL_STEPS}
      backHref={routePaths.patient}
      user={session.user}
    >
      <div className={patientInnerPageStackClass}>
        <BookingUpcomingSection
          bookings={records.upcoming}
          appDisplayTimeZone={appDisplayTimeZone}
        />
        {records.upcoming.length > 0 && (
          <Link
            href={addressHref}
            className={cn(patientInlineLinkClass, 'inline-flex items-center gap-1 underline-offset-4')}
          >
            Адрес кабинета
          </Link>
        )}
        <PatientBookingPaymentHistorySection appDisplayTimeZone={appDisplayTimeZone} />
        <PatientMembershipsSection
          visible
          subscriptionsMutationsAllowed={membershipMutation.available}
          paymentsMutationsAllowed={paymentsMutation.available}
        />
        <FormatStepClient
          cities={catalogCities}
          onlineLocation={onlineLocation}
          catalogError={catalogCitiesError}
        />
        <div className="mt-10 mb-10 flex justify-center">
          <Link
            href={routePaths.patientMessages}
            prefetch={false}
            className={cn(
              patientSecondaryActionClass,
              'w-auto px-5',
            )}
          >
            Задать вопрос в чате
          </Link>
        </div>
        <BookingPastHistorySection
          items={records.history}
          appDisplayTimeZone={appDisplayTimeZone}
        />
        <LegalFooterLinks className="mt-6 pb-8" />
      </div>
    </BookingWizardShell>
  );
}
