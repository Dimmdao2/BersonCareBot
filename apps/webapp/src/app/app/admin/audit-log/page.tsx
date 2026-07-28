import { requireAdminDoctorPage } from '@/app/app/settings/requireAdminDoctorPage';
import { AdminAuditLogSection } from './AdminAuditLogSection';
import { AdminAuthRegistrationEventsSection } from './AdminAuthRegistrationEventsSection';
import { DoctorAppShell } from '@/shared/ui/doctor/DoctorAppShell';
import { DoctorPageHeader } from '@/shared/ui/doctor/shell/DoctorPageHeader';

export default async function DoctorAuditLogPage() {
  await requireAdminDoctorPage();
  return (
    <DoctorAppShell title="Журнал операций">
      <DoctorPageHeader title="Журнал операций" />
      <AdminAuthRegistrationEventsSection />
      <AdminAuditLogSection />
    </DoctorAppShell>
  );
}
