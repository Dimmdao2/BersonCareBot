import { requirePlatformOperationsPage } from '@/app-layer/guards/requireRole';
import { DoctorAppShell } from '@/shared/ui/doctor/DoctorAppShell';
import { DoctorPageHeader } from '@/shared/ui/doctor/shell/DoctorPageHeader';
import { ClinicsConsoleClient } from './ClinicsConsoleClient';

export default async function ClinicsPage() {
  await requirePlatformOperationsPage();

  return (
    <DoctorAppShell title="Клиники">
      <DoctorPageHeader title="Клиники" />
      <ClinicsConsoleClient />
    </DoctorAppShell>
  );
}
