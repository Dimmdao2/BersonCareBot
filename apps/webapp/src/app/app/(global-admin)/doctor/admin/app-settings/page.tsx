import { requireAdminDoctorPage } from "@/app/app/settings/requireAdminDoctorPage";
import { loadAdminSettingsPageData } from "@/app/app/settings/adminSettingsData";
import { AppParametersSection } from "@/app/app/settings/AppParametersSection";
import { EmailSmtpSection } from "@/app/app/settings/EmailSmtpSection";
import { VideoSystemSettingsSection } from "@/app/app/settings/VideoSystemSettingsSection";
import { WebPushVapidSection } from "@/app/app/settings/WebPushVapidSection";
import { NotificationsTopicsSection } from "@/app/app/settings/NotificationsTopicsSection";
import { DoctorAppShell } from "@/shared/ui/doctor/DoctorAppShell";
import { DoctorPageHeader } from "@/shared/ui/doctor/shell/DoctorPageHeader";

export default async function DoctorAdminAppSettingsPage() {
  await requireAdminDoctorPage();
  const data = await loadAdminSettingsPageData();

  return (
    <DoctorAppShell title="Настройки приложения">
      <DoctorPageHeader title="Настройки приложения" />
      <AppParametersSection {...data.appParametersConfig} />
      <EmailSmtpSection {...data.smtpOutboundUi} />
      <VideoSystemSettingsSection {...data.videoSystemSettingsProps} />
      <WebPushVapidSection
        initialPublicKey={data.webPushVapidUi.publicKey}
        hasStoredPrivateKey={data.webPushVapidUi.hasStoredPrivateKey}
      />
      <NotificationsTopicsSection initialRows={data.notificationsTopicsRows} />
    </DoctorAppShell>
  );
}
