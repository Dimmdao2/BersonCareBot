import { requireAdminDoctorPage } from "@/app/app/settings/requireAdminDoctorPage";
import { BookingMergeCandidatesSection } from "@/app/app/settings/BookingMergeCandidatesSection";
import { DOCTOR_PAGE_CONTAINER_CLASS } from "@/shared/ui/doctor/doctorWorkspaceLayout";
import { doctorPageTitleClass } from "@/shared/ui/doctor/doctorVisual";

export default async function DoctorBookingMergePage() {
  await requireAdminDoctorPage();

  return (
    <div className={DOCTOR_PAGE_CONTAINER_CLASS}>
      <h1 className={`mb-3 ${doctorPageTitleClass}`}>Объединение профилей (запись с сайта)</h1>
      <BookingMergeCandidatesSection />
    </div>
  );
}
