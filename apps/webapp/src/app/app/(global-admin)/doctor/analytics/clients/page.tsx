/**
 * Аналитика по клиентам (/app/doctor/analytics/clients).
 */
import { requirePlatformOperationsPage } from '@/app-layer/guards/requireRole';
import { DoctorAppShell } from '@/shared/ui/doctor/DoctorAppShell';
import { DoctorEmptyState } from '@/shared/ui/doctor/DoctorEmptyState';
import { DoctorSection } from '@/shared/ui/doctor/DoctorSection';
import { DoctorPageHeader } from '@/shared/ui/doctor/shell/DoctorPageHeader';

export default async function DoctorAnalyticsClientsPage() {
  const session = await requirePlatformOperationsPage();
  return (
    <DoctorAppShell title="Аналитика платформы" user={session.user}>
      <DoctorPageHeader title="Аналитика клиентов" />
      <DoctorSection>
        <DoctorEmptyState>
          Клиническая аналитика недоступна в кабинете администратора.
        </DoctorEmptyState>
      </DoctorSection>
    </DoctorAppShell>
  );
}
