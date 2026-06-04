import { requireAdminDoctorPage } from "@/app/app/settings/requireAdminDoctorPage";
import { loadAdminSettingsPageData } from "@/app/app/settings/adminSettingsData";
import { GoogleCalendarSection } from "@/app/app/settings/GoogleCalendarSection";
import { DOCTOR_PAGE_CONTAINER_CLASS } from "@/shared/ui/doctor/doctorWorkspaceLayout";

export default async function DoctorAdminIntegrationsPage() {
  await requireAdminDoctorPage();
  const { googleCalendarConfig } = await loadAdminSettingsPageData();

  return (
    <div className={DOCTOR_PAGE_CONTAINER_CLASS}>
      <h1 className="mb-6 text-xl font-semibold">Интеграции</h1>
      <GoogleCalendarSection {...googleCalendarConfig} />
    </div>
  );
}
