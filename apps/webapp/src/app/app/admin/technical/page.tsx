import { requirePlatformOperationsPage } from '@/app-layer/guards/requireRole';
import { loadAdminSettingsPageData } from '@/app/app/settings/adminSettingsData';
import { AdminSettingsSection } from '@/app/app/settings/AdminSettingsSection';
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
        importantFallbackDelayMinutes={diagnostics.importantFallbackDelayMinutes}
        platformUserMergeV2Enabled={diagnostics.platformUserMergeV2Enabled}
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
        materialRatingsEnabled={diagnostics.materialRatingsEnabled}
      />
      <OperatorHealthProbeSettingsSection />
    </DoctorAppShell>
  );
}
