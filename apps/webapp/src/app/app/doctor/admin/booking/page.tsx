import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { parseBookingPaymentSettingsValue } from "@/modules/payments/bookingPaymentSettings";
import { requireAdminDoctorPage } from "@/app/app/settings/requireAdminDoctorPage";
import { BookingPaymentsSection } from "@/app/app/settings/BookingPaymentsSection";
import { BookingPrepaymentSection } from "@/app/app/settings/BookingPrepaymentSection";
import { BookingCatalogHelp } from "@/app/app/settings/BookingCatalogHelp";
import { BookingEngineSection } from "@/app/app/settings/BookingEngineSection";
import { BookingFormFieldsSection } from "@/app/app/settings/BookingFormFieldsSection";
import { BookingMergeCandidatesSection } from "@/app/app/settings/BookingMergeCandidatesSection";
import { BookingPublicAttributionSection } from "@/app/app/settings/BookingPublicAttributionSection";
import { BookingPublicWidgetSection } from "@/app/app/settings/BookingPublicWidgetSection";
import { BookingScheduleBlocksSection } from "@/app/app/settings/BookingScheduleBlocksSection";
import { BookingPoliciesSection } from "@/app/app/settings/BookingPoliciesSection";
import { BookingEventNotificationsSection } from "@/app/app/settings/BookingEventNotificationsSection";
import { BookingManualLifecycleSection } from "@/app/app/settings/BookingManualLifecycleSection";
import { BookingCatalogPackagesSection } from "@/app/app/settings/BookingCatalogPackagesSection";
import { BookingCatalogProductsSection } from "@/app/app/settings/BookingCatalogProductsSection";
import { BookingPatientPackagesSection } from "@/app/app/settings/BookingPatientPackagesSection";
import { BookingPatientProductsSection } from "@/app/app/settings/BookingPatientProductsSection";
import { RubitimeSection } from "@/app/app/settings/RubitimeSection";
import { DOCTOR_PAGE_CONTAINER_CLASS } from "@/shared/ui/doctorWorkspaceLayout";

export default async function DoctorAdminBookingPage() {
  await requireAdminDoctorPage();
  const deps = buildAppDeps();
  const paymentEnabledRow = await deps.systemSettings.getSetting("booking_payment_enabled", "admin");
  const paymentEnabled =
    paymentEnabledRow != null &&
    paymentEnabledRow.valueJson !== null &&
    typeof paymentEnabledRow.valueJson === "object" &&
    (paymentEnabledRow.valueJson as Record<string, unknown>).value === true;
  const providersRow = await deps.systemSettings.getSetting("booking_payment_providers", "admin");
  const providersJson = parseBookingPaymentSettingsValue(providersRow?.valueJson ?? null);

  return (
    <div className={DOCTOR_PAGE_CONTAINER_CLASS}>
      <h1 className="mb-6 text-xl font-semibold">Запись</h1>
      <div className="space-y-8">
        <section id="booking-help" className="space-y-4">
          <BookingCatalogHelp />
        </section>
        <section id="booking-catalog" className="space-y-4">
          <BookingEngineSection />
          <BookingFormFieldsSection />
          <BookingCatalogPackagesSection apiBase="/api/doctor/booking-engine/packages" />
          <BookingCatalogProductsSection apiBase="/api/doctor/booking-engine/products" />
        </section>
        <section id="booking-policies-pay" className="space-y-4">
          <BookingPoliciesSection />
          <BookingEventNotificationsSection />
          <BookingPaymentsSection paymentEnabled={paymentEnabled} providersJson={providersJson} />
          <BookingPrepaymentSection />
        </section>
        <section id="booking-public" className="space-y-4">
          <BookingPublicWidgetSection />
          <BookingPublicAttributionSection />
        </section>
        <section id="booking-operations" className="space-y-4">
          <BookingPatientPackagesSection
            apiBase="/api/doctor/booking-engine/patient-packages"
            packagesApi="/api/doctor/booking-engine/packages"
            servicesApi="/api/doctor/booking-engine/services"
          />
          <BookingPatientProductsSection
            apiBase="/api/doctor/booking-engine/patient-products"
            servicesApi="/api/doctor/booking-engine/services"
          />
          <BookingManualLifecycleSection apiBase="/api/doctor/booking-engine" />
          <BookingMergeCandidatesSection />
          <BookingScheduleBlocksSection />
        </section>
        <section id="booking-bridge" className="space-y-4">
          <RubitimeSection />
        </section>
      </div>
    </div>
  );
}
