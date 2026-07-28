import { requireAdminDoctorPage } from '@/app/app/settings/requireAdminDoctorPage';
import { DoctorAppShell } from '@/shared/ui/doctor/DoctorAppShell';
import { DoctorPageHeader } from '@/shared/ui/doctor/shell/DoctorPageHeader';
import { PlatformIntegrationAvailabilitySection } from './PlatformIntegrationAvailabilitySection';

export default async function DoctorAdminIntegrationsPage() {
  await requireAdminDoctorPage();

  return (
    <DoctorAppShell title="Интеграции">
      <DoctorPageHeader title="Интеграции" />
      <PlatformIntegrationAvailabilitySection />
    </DoctorAppShell>
  );
}
