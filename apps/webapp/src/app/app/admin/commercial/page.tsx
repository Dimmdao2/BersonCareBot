import { requirePlatformOperationsPage } from '@/app-layer/guards/requireRole';
import { DoctorAppShell } from '@/shared/ui/doctor/DoctorAppShell';
import { DoctorPageHeader } from '@/shared/ui/doctor/shell/DoctorPageHeader';
import { CommercialConstructorClient } from './CommercialConstructorClient';
import { TariffPolicyHistoryPanel } from './TariffPolicyHistoryPanel';

export default async function CommercialPage() {
  await requirePlatformOperationsPage();
  return (
    <DoctorAppShell title="Тарифы и триал">
      <DoctorPageHeader
        title="Тарифы и триал"
        subtitle="Конструктор тарифов и правила доступа организаций"
      />
      <CommercialConstructorClient />
      <TariffPolicyHistoryPanel />
    </DoctorAppShell>
  );
}
