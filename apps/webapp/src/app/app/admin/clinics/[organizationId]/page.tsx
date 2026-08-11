import { requirePlatformOperationsPage } from '@/app-layer/guards/requireRole';
import { DoctorAppShell } from '@/shared/ui/doctor/DoctorAppShell';
import { DoctorPageHeader } from '@/shared/ui/doctor/shell/DoctorPageHeader';
import { ClinicsConsoleClient } from '../ClinicsConsoleClient';

export default async function ClinicPage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  await requirePlatformOperationsPage();
  const { organizationId } = await params;

  return (
    <DoctorAppShell title="Карточка клиники">
      <DoctorPageHeader title="Карточка клиники" />
      <ClinicsConsoleClient organizationId={organizationId} />
    </DoctorAppShell>
  );
}
