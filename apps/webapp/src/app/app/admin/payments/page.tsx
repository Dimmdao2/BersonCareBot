import { requirePlatformOperationsPage } from '@/app-layer/guards/requireRole';
import { getAppDisplayTimeZone } from '@/modules/system-settings/appDisplayTimezone';
import { DoctorAppShell } from '@/shared/ui/doctor/DoctorAppShell';
import { DoctorPageHeader } from '@/shared/ui/doctor/shell/DoctorPageHeader';
import { PlatformPaymentsSection } from './PlatformPaymentsSection';

export default async function PlatformPaymentsPage() {
  await requirePlatformOperationsPage();
  const displayTimeZone = await getAppDisplayTimeZone();
  return (
    <DoctorAppShell title="Платежи">
      <DoctorPageHeader title="Платежи" />
      <PlatformPaymentsSection displayTimeZone={displayTimeZone} />
    </DoctorAppShell>
  );
}
