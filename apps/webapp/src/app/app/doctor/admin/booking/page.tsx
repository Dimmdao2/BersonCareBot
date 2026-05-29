import { requireAdminDoctorPage } from "@/app/app/settings/requireAdminDoctorPage";
import { BookingCatalogHelp } from "@/app/app/settings/BookingCatalogHelp";
import { BookingEngineSection } from "@/app/app/settings/BookingEngineSection";
import { BookingFormFieldsSection } from "@/app/app/settings/BookingFormFieldsSection";
import { BookingMergeCandidatesSection } from "@/app/app/settings/BookingMergeCandidatesSection";
import { BookingPublicAttributionSection } from "@/app/app/settings/BookingPublicAttributionSection";
import { BookingPublicWidgetSection } from "@/app/app/settings/BookingPublicWidgetSection";
import { BookingScheduleBlocksSection } from "@/app/app/settings/BookingScheduleBlocksSection";
import { BookingPoliciesSection } from "@/app/app/settings/BookingPoliciesSection";
import { BookingManualLifecycleSection } from "@/app/app/settings/BookingManualLifecycleSection";
import { RubitimeSection } from "@/app/app/settings/RubitimeSection";
import { DOCTOR_PAGE_CONTAINER_CLASS } from "@/shared/ui/doctorWorkspaceLayout";

export default async function DoctorAdminBookingPage() {
  await requireAdminDoctorPage();

  return (
    <div className={DOCTOR_PAGE_CONTAINER_CLASS}>
      <h1 className="mb-6 text-xl font-semibold">Запись / Rubitime</h1>
      <div className="space-y-6">
        <BookingCatalogHelp />
        <BookingEngineSection />
        <BookingFormFieldsSection />
        <BookingPoliciesSection />
        <BookingManualLifecycleSection apiBase="/api/doctor/booking-engine" />
        <BookingPublicWidgetSection />
        <BookingPublicAttributionSection />
        <BookingMergeCandidatesSection />
        <BookingScheduleBlocksSection />
        <RubitimeSection />
      </div>
    </div>
  );
}
