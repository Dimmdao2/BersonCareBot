import { requirePlatformOperationsPage } from '@/app-layer/guards/requireRole';
import { loadAdminSettingsPageData } from '@/app/app/settings/adminSettingsData';
import { AdminSettingsSection } from '@/app/app/settings/AdminSettingsSection';
import { OperatorHealthAlertsSection } from '@/app/app/settings/OperatorHealthAlertsSection';
import { OperatorHealthProjectionThresholdsSection } from '@/app/app/settings/OperatorHealthProjectionThresholdsSection';
import { ErrorTrackingSettingsSection } from '@/app/app/settings/ErrorTrackingSettingsSection';
import { OperatorHealthProbeSettingsSection } from '@/app/app/admin/system-health/OperatorHealthProbeSettingsSection';
import { DoctorAppShell } from '@/shared/ui/doctor/DoctorAppShell';
import { DoctorPageHeader } from '@/shared/ui/doctor/shell/DoctorPageHeader';

export default async function DoctorAdminTechnicalPage() {
  await requirePlatformOperationsPage();
  const { diagnostics, errorTracking } = await loadAdminSettingsPageData();

  return (
    <DoctorAppShell title="Технические режимы">
      <DoctorPageHeader title="Технические режимы" />
      <ErrorTrackingSettingsSection
        initialEnabled={errorTracking.enabled}
        hasStoredDsn={errorTracking.hasStoredDsn}
      />
      <AdminSettingsSection
        devMode={diagnostics.devMode}
        debugForwardToAdmin={diagnostics.debugForwardToAdmin}
        miniappAuthVerboseServerLog={diagnostics.miniappAuthVerboseServerLog}
        importantFallbackDelayMinutes={diagnostics.importantFallbackDelayMinutes}
        platformUserMergeV2Enabled={diagnostics.platformUserMergeV2Enabled}
        integratorLinkedPhoneSource={diagnostics.integratorLinkedPhoneSource}
        testAccountPhones={diagnostics.testAccountIdentifiers.phones.join(' ')}
        testAccountTelegramIds={diagnostics.testAccountIdentifiers.telegramIds.join(' ')}
        testAccountMaxIds={diagnostics.testAccountIdentifiers.maxIds.join(' ')}
        testAccountEmails={diagnostics.testAccountIdentifiers.emails.join(' ')}
        patientAppMaintenanceEnabled={diagnostics.patientAppMaintenanceEnabled}
        patientAppMaintenanceMessage={diagnostics.patientAppMaintenanceMessage}
        patientProgramDiscussionDoctorReplyFromLogEnabled={
          diagnostics.patientProgramDiscussionDoctorReplyFromLogEnabled
        }
        patientProgramDiscussionUiEnabled={diagnostics.patientProgramDiscussionUiEnabled}
        patientProgramDiscussionMediaSubmissionEnabled={
          diagnostics.patientProgramDiscussionMediaSubmissionEnabled
        }
        patientBookingUrl={diagnostics.patientBookingUrl}
      />
      <OperatorHealthProbeSettingsSection />
      <OperatorHealthAlertsSection
        initialConfig={diagnostics.operatorHealthAlertsConfig}
        initialFallbackEmail={diagnostics.operatorAlertFallbackEmail}
      />
      <OperatorHealthProjectionThresholdsSection
        initialThresholds={diagnostics.operatorHealthProjectionThresholds}
      />
    </DoctorAppShell>
  );
}
