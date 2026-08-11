/**
 * Platform analytics is deliberately aggregate-only.  Clinical analytics has a
 * different owner and must never be composed under this platform route.
 */
import { requirePlatformOperationsPage } from '@/app-layer/guards/requireRole';
import { DoctorAppShell } from '@/shared/ui/doctor/DoctorAppShell';
import { DoctorEmptyState } from '@/shared/ui/doctor/DoctorEmptyState';
import { DoctorSection } from '@/shared/ui/doctor/DoctorSection';
import { DoctorPageHeader } from '@/shared/ui/doctor/shell/DoctorPageHeader';

export default async function DoctorAnalyticsPage() {
  const session = await requirePlatformOperationsPage();
  return (
    <DoctorAppShell title="Аналитика платформы" user={session.user}>
      <DoctorPageHeader title="Аналитика" />
      <DoctorSection>
        <DoctorEmptyState>Аналитика пока недоступна.</DoctorEmptyState>
      </DoctorSection>
    </DoctorAppShell>
  );
}
