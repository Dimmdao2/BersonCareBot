import { requireAdminDoctorPage } from "@/app/app/settings/requireAdminDoctorPage";
import { loadAdminSettingsPageData } from "@/app/app/settings/adminSettingsData";
import { AppParametersSection } from "@/app/app/settings/AppParametersSection";
import { EmailSmtpSection } from "@/app/app/settings/EmailSmtpSection";
import { VideoSystemSettingsSection } from "@/app/app/settings/VideoSystemSettingsSection";
import { WebPushVapidSection } from "@/app/app/settings/WebPushVapidSection";
import { NotificationsTopicsSection } from "@/app/app/settings/NotificationsTopicsSection";
import { DOCTOR_PAGE_CONTAINER_CLASS } from "@/shared/ui/doctor/doctorWorkspaceLayout";

export default async function DoctorAdminAppSettingsPage() {
  await requireAdminDoctorPage();
  const data = await loadAdminSettingsPageData();

  return (
    <div className={DOCTOR_PAGE_CONTAINER_CLASS}>
      <h1 className="mb-6 text-xl font-semibold">Настройки приложения</h1>
      <div className="space-y-6">
        <AppParametersSection {...data.appParametersConfig} />
        <EmailSmtpSection {...data.smtpOutboundUi} />
        <VideoSystemSettingsSection {...data.videoSystemSettingsProps} />
        <WebPushVapidSection
          initialPublicKey={data.webPushVapidUi.publicKey}
          hasStoredPrivateKey={data.webPushVapidUi.hasStoredPrivateKey}
        />
        <NotificationsTopicsSection initialRows={data.notificationsTopicsRows} />
      </div>
    </div>
  );
}
