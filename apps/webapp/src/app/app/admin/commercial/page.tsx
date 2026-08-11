import { requirePlatformOperationsPage } from '@/app-layer/guards/requireRole';
import { DoctorAppShell } from '@/shared/ui/doctor/DoctorAppShell';
import { DoctorPageHeader } from '@/shared/ui/doctor/shell/DoctorPageHeader';
import { CommercialConstructorClient } from './CommercialConstructorClient';
import { TariffPolicyHistoryPanel } from './TariffPolicyHistoryPanel';
import { getAppDisplayTimeZone } from '@/modules/system-settings/appDisplayTimezone';

export default async function CommercialPage() {
  await requirePlatformOperationsPage();
  const displayTimeZone = await getAppDisplayTimeZone();
  return (
    <DoctorAppShell title="Тарифы и триал">
      <DoctorPageHeader title="Тарифы и триал" />
      <CommercialConstructorClient />
      <TariffPolicyHistoryPanel displayTimeZone={displayTimeZone} />
    </DoctorAppShell>
  );
}
