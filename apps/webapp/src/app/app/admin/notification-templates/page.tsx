import { requirePlatformOperationsPage } from '@/app-layer/guards/requireRole';
import { DoctorAppShell } from '@/shared/ui/doctor/DoctorAppShell';
import { DoctorPageHeader } from '@/shared/ui/doctor/shell/DoctorPageHeader';
import { ScheduleNotificationsSection } from '@/app/app/doctor/schedule/tabs/notifications/ScheduleNotificationsSection';

export default async function PlatformNotificationTemplatesPage() {
  await requirePlatformOperationsPage();

  return (
    <DoctorAppShell title="Шаблоны уведомлений">
      <DoctorPageHeader title="Шаблоны" />
      <ScheduleNotificationsSection endpoint="/api/admin/notification-templates" />
    </DoctorAppShell>
  );
}
