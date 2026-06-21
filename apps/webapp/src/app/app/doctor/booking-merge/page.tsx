import { requireAdminDoctorPage } from "@/app/app/settings/requireAdminDoctorPage";
import { BookingMergeCandidatesSection } from "@/app/app/settings/BookingMergeCandidatesSection";
import { DoctorAppShell } from "@/shared/ui/doctor/DoctorAppShell";
import { DoctorPageHeader } from "@/shared/ui/doctor/shell/DoctorPageHeader";

export default async function DoctorBookingMergePage() {
  await requireAdminDoctorPage();

  return (
    <DoctorAppShell title="Объединение профилей (запись с сайта)">
      <DoctorPageHeader title="Объединение профилей (запись с сайта)" />
      <BookingMergeCandidatesSection />
    </DoctorAppShell>
  );
}
