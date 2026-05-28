import { requireAdminDoctorPage } from "@/app/app/settings/requireAdminDoctorPage";
import { AdminAuditLogSection } from "@/app/app/settings/AdminAuditLogSection";
import { AdminAuthRegistrationEventsSection } from "@/app/app/doctor/audit-log/AdminAuthRegistrationEventsSection";
import { DOCTOR_PAGE_CONTAINER_CLASS } from "@/shared/ui/doctorWorkspaceLayout";

export default async function DoctorAuditLogPage() {
  await requireAdminDoctorPage();
  return (
    <div className={`${DOCTOR_PAGE_CONTAINER_CLASS} flex flex-col gap-6`}>
      <h1 className="text-xl font-semibold">Журнал операций</h1>
      <AdminAuthRegistrationEventsSection />
      <AdminAuditLogSection />
    </div>
  );
}
