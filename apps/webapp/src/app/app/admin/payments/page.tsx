import { requirePlatformOperationsPage } from '@/app-layer/guards/requireRole';
import { DoctorAppShell } from '@/shared/ui/doctor/DoctorAppShell';
import { DoctorPageHeader } from '@/shared/ui/doctor/shell/DoctorPageHeader';
import { PlatformPaymentsSection } from './PlatformPaymentsSection';

export default async function PlatformPaymentsPage() {
  await requirePlatformOperationsPage();
  return (
    <DoctorAppShell title="Платежи">
      <DoctorPageHeader title="Платежи" />
      <PlatformPaymentsSection />
    </DoctorAppShell>
  );
}
