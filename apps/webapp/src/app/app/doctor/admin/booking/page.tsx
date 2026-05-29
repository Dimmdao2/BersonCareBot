import { requireAdminDoctorPage } from "@/app/app/settings/requireAdminDoctorPage";
import { BookingCatalogHelp } from "@/app/app/settings/BookingCatalogHelp";
import { BookingEngineSection } from "@/app/app/settings/BookingEngineSection";
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
        <RubitimeSection />
      </div>
    </div>
  );
}
