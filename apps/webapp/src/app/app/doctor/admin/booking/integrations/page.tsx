import { BookingEngineSection } from "@/app/app/settings/BookingEngineSection";
import { BookingRubitimeMappingSection } from "@/app/app/settings/BookingRubitimeMappingSection";
import { RubitimeSection } from "@/app/app/settings/RubitimeSection";
import { DoctorSection, DoctorSectionHeader, DoctorSectionTitle } from "@/shared/ui/doctor/DoctorSection";
import { doctorSectionTitleClass } from "@/shared/ui/doctor/doctorVisual";

export default function DoctorAdminBookingIntegrationsPage() {
  return (
    <div className="flex flex-col gap-4">
      <BookingRubitimeMappingSection />

      <details className="rounded-xl border border-border bg-card p-3">
        <summary className={doctorSectionTitleClass}>Справочник Rubitime</summary>
        <div className="mt-3">
          <RubitimeSection />
        </div>
      </details>

      <DoctorSection>
        <DoctorSectionHeader>
          <DoctorSectionTitle>Технические настройки</DoctorSectionTitle>
        </DoctorSectionHeader>
        <BookingEngineSection mode="integrations" />
      </DoctorSection>
    </div>
  );
}
