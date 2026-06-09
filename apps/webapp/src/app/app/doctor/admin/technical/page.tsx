import { requireAdminDoctorPage } from "@/app/app/settings/requireAdminDoctorPage";
import { loadAdminSettingsPageData } from "@/app/app/settings/adminSettingsData";
import { AdminSettingsSection } from "@/app/app/settings/AdminSettingsSection";
import { OperatorHealthAlertsSection } from "@/app/app/settings/OperatorHealthAlertsSection";
import { OperatorHealthProjectionThresholdsSection } from "@/app/app/settings/OperatorHealthProjectionThresholdsSection";
import { DOCTOR_PAGE_CONTAINER_CLASS } from "@/shared/ui/doctor/doctorWorkspaceLayout";
import { doctorPageTitleClass } from "@/shared/ui/doctor/doctorVisual";

export default async function DoctorAdminTechnicalPage() {
  await requireAdminDoctorPage();
  const { diagnostics } = await loadAdminSettingsPageData();

  return (
    <div className={DOCTOR_PAGE_CONTAINER_CLASS}>
      <h1 className={`mb-3 ${doctorPageTitleClass}`}>Технические режимы</h1>
      <div className="space-y-4">
        <AdminSettingsSection
          devMode={diagnostics.devMode}
          debugForwardToAdmin={diagnostics.debugForwardToAdmin}
          miniappAuthVerboseServerLog={diagnostics.miniappAuthVerboseServerLog}
          importantFallbackDelayMinutes={diagnostics.importantFallbackDelayMinutes}
          platformUserMergeV2Enabled={diagnostics.platformUserMergeV2Enabled}
          integratorLinkedPhoneSource={diagnostics.integratorLinkedPhoneSource}
          adminPhone={diagnostics.adminPhone}
          adminTelegramId={diagnostics.adminTelegramId}
          adminMaxId={diagnostics.adminMaxId}
          testAccountPhones={diagnostics.testAccountIdentifiers.phones.join(" ")}
          testAccountTelegramIds={diagnostics.testAccountIdentifiers.telegramIds.join(" ")}
          testAccountMaxIds={diagnostics.testAccountIdentifiers.maxIds.join(" ")}
          patientAppMaintenanceEnabled={diagnostics.patientAppMaintenanceEnabled}
          patientAppMaintenanceMessage={diagnostics.patientAppMaintenanceMessage}
          patientProgramDiscussionDoctorReplyFromLogEnabled={
            diagnostics.patientProgramDiscussionDoctorReplyFromLogEnabled
          }
          patientProgramDiscussionUiEnabled={diagnostics.patientProgramDiscussionUiEnabled}
          patientProgramDiscussionMediaSubmissionEnabled={diagnostics.patientProgramDiscussionMediaSubmissionEnabled}
          patientBookingUrl={diagnostics.patientBookingUrl}
        />
        <OperatorHealthAlertsSection initialConfig={diagnostics.operatorHealthAlertsConfig} />
        <OperatorHealthProjectionThresholdsSection
          initialThresholds={diagnostics.operatorHealthProjectionThresholds}
        />
      </div>
    </div>
  );
}
