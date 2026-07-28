import { requirePlatformOperationsPage } from '@/app-layer/guards/requireRole';
import { DoctorAppShell } from '@/shared/ui/doctor/DoctorAppShell';
import { DoctorEmptyState } from '@/shared/ui/doctor/DoctorEmptyState';

export default async function DoctorAnalyticsNotificationsPage() {
  const session = await requirePlatformOperationsPage();
  return (
    <DoctorAppShell title="Аналитика платформы" user={session.user}>
      <DoctorEmptyState title="Детализация уведомлений недоступна в platform mode" />
    </DoctorAppShell>
  );
}
