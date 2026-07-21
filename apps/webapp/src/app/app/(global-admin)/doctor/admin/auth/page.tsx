import { requireAdminDoctorPage } from "@/app/app/settings/requireAdminDoctorPage";
import { loadAdminSettingsPageData } from "@/app/app/settings/adminSettingsData";
import { AuthProvidersSection } from "@/app/app/settings/AuthProvidersSection";
import { DoctorAppShell } from "@/shared/ui/doctor/DoctorAppShell";
import { DoctorPageHeader } from "@/shared/ui/doctor/shell/DoctorPageHeader";
import { PlatformAuthChannelPolicySection } from "./PlatformAuthChannelPolicySection";

export default async function DoctorAdminAuthPage() {
  await requireAdminDoctorPage();
  const { authProvidersConfig } = await loadAdminSettingsPageData();

  return (
    <DoctorAppShell title="Авторизация">
      <DoctorPageHeader title="Авторизация" />
      <PlatformAuthChannelPolicySection />
      <AuthProvidersSection {...authProvidersConfig} />
    </DoctorAppShell>
  );
}
