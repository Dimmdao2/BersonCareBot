import { requireAdminDoctorPage } from "@/app/app/settings/requireAdminDoctorPage";
import { loadAdminSettingsPageData } from "@/app/app/settings/adminSettingsData";
import { GoogleCalendarSection } from "@/app/app/settings/GoogleCalendarSection";
import { DoctorAppShell } from "@/shared/ui/doctor/DoctorAppShell";
import { DoctorPageHeader } from "@/shared/ui/doctor/shell/DoctorPageHeader";

export default async function DoctorAdminIntegrationsPage() {
  await requireAdminDoctorPage();
  const { googleCalendarConfig } = await loadAdminSettingsPageData();

  return (
    <DoctorAppShell title="Интеграции">
      <DoctorPageHeader title="Интеграции" />
      <GoogleCalendarSection {...googleCalendarConfig} />
    </DoctorAppShell>
  );
}
