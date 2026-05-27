import { requireAdminDoctorPage } from "@/app/app/settings/requireAdminDoctorPage";
import { loadAdminSettingsPageData } from "@/app/app/settings/adminSettingsData";
import { AuthProvidersSection } from "@/app/app/settings/AuthProvidersSection";
import { DOCTOR_PAGE_CONTAINER_CLASS } from "@/shared/ui/doctorWorkspaceLayout";

export default async function DoctorAdminAuthPage() {
  await requireAdminDoctorPage();
  const { authProvidersConfig } = await loadAdminSettingsPageData();

  return (
    <div className={DOCTOR_PAGE_CONTAINER_CLASS}>
      <h1 className="mb-6 text-xl font-semibold">Авторизация</h1>
      <AuthProvidersSection {...authProvidersConfig} />
    </div>
  );
}
