import { requireAdminDoctorPage } from "@/app/app/settings/requireAdminDoctorPage";
import { loadAdminSettingsPageData } from "@/app/app/settings/adminSettingsData";
import { GoogleCalendarSection } from "@/app/app/settings/GoogleCalendarSection";
import { DOCTOR_PAGE_CONTAINER_CLASS } from "@/shared/ui/doctor/doctorWorkspaceLayout";
import { doctorPageTitleClass } from "@/shared/ui/doctor/doctorVisual";

export default async function DoctorAdminIntegrationsPage() {
  await requireAdminDoctorPage();
  const { googleCalendarConfig } = await loadAdminSettingsPageData();

  return (
    <div className={DOCTOR_PAGE_CONTAINER_CLASS}>
      <h1 className={`mb-3 ${doctorPageTitleClass}`}>Интеграции</h1>
      <GoogleCalendarSection {...googleCalendarConfig} />
    </div>
  );
}
