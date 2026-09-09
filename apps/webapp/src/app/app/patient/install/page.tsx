import { routePaths } from '@/app-layer/routes/paths';
import { requirePatientAccess } from '@/app-layer/guards/requireRole';
import { PatientAppShell } from '@/shared/ui/patient/PatientAppShell';
import { PwaInstallSection } from '@/shared/ui/patient/marketing/PwaInstallSection';
import { WebPushOptInControls } from './WebPushOptInControls';

export default async function PatientInstallPage() {
  const session = await requirePatientAccess(routePaths.patientInstall);
  return (
    <PatientAppShell
      title="Установить приложение"
      user={session.user}
      backHref={routePaths.patient}
      backLabel="Меню"
    >
      <PwaInstallSection notificationControls={<WebPushOptInControls />} />
    </PatientAppShell>
  );
}
