import { requireGlobalAdminDoctorPage } from '@/app/app/settings/requireAdminDoctorPage';
import { SystemHealthSection } from './SystemHealthSection';
import { DoctorAppShell } from '@/shared/ui/doctor/DoctorAppShell';
import { DoctorPageHeader } from '@/shared/ui/doctor/shell/DoctorPageHeader';
import { getAppDisplayTimeZone } from '@/modules/system-settings/appDisplayTimezone';

export default async function DoctorSystemHealthPage() {
  await requireGlobalAdminDoctorPage();
  const displayTimeZone = await getAppDisplayTimeZone();
  return (
    <DoctorAppShell title="Здоровье системы">
      <DoctorPageHeader title="Здоровье системы" />
      <SystemHealthSection displayTimeZone={displayTimeZone} />
    </DoctorAppShell>
  );
}
