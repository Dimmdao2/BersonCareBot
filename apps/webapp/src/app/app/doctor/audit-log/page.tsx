import { requireAdminDoctorPage } from "@/app/app/settings/requireAdminDoctorPage";
import { AdminAuditLogSection } from "@/app/app/settings/AdminAuditLogSection";
import { AdminAuthRegistrationEventsSection } from "@/app/app/doctor/audit-log/AdminAuthRegistrationEventsSection";
import { DoctorAppShell } from "@/shared/ui/doctor/DoctorAppShell";
import { DoctorPageHeader } from "@/shared/ui/doctor/shell/DoctorPageHeader";

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
