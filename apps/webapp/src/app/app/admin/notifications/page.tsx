import { requirePlatformOperationsPage } from '@/app-layer/guards/requireRole';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { loadStaffNotificationsSection } from '@/app/app/account/staffNotificationsSection';
import { loadStaffAccountPageContext } from '@/app/app/account/accountContext';
import { loadAdminSettingsPageData } from '@/app/app/settings/adminSettingsData';
import { OperatorHealthAlertsSection } from '@/app/app/settings/OperatorHealthAlertsSection';
import { DoctorAppShell } from '@/shared/ui/doctor/DoctorAppShell';
import { DoctorPageHeader } from '@/shared/ui/doctor/shell/DoctorPageHeader';

export default async function DoctorAdminNotificationsPage() {
  await requirePlatformOperationsPage();
  const deps = buildAppDeps();
  const { session, workspaceContext } = await loadStaffAccountPageContext();
  const { diagnostics } = await loadAdminSettingsPageData();
  const personalNotifications = await loadStaffNotificationsSection(
    deps,
    session,
    workspaceContext,
  );

  return (
    <DoctorAppShell title="Уведомления">
      <DoctorPageHeader title="Уведомления" />
      {personalNotifications}
      <OperatorHealthAlertsSection
        initialConfig={diagnostics.operatorHealthAlertsConfig}
        initialFallbackEmail={diagnostics.operatorAlertFallbackEmail}
      />
    </DoctorAppShell>
  );
}
