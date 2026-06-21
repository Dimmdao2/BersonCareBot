import { requireAdminDoctorPage } from "@/app/app/settings/requireAdminDoctorPage";
import { SystemHealthSection } from "@/app/app/settings/SystemHealthSection";
import { DoctorAppShell } from "@/shared/ui/doctor/DoctorAppShell";
import { DoctorPageHeader } from "@/shared/ui/doctor/shell/DoctorPageHeader";

export default async function DoctorSystemHealthPage() {
  await requireAdminDoctorPage();
  return (
    <DoctorAppShell title="Здоровье системы">
      <DoctorPageHeader title="Здоровье системы" />
      <SystemHealthSection />
    </DoctorAppShell>
  );
}
