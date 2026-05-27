import { requireAdminDoctorPage } from "@/app/app/settings/requireAdminDoctorPage";
import { AdminAuditLogSection } from "@/app/app/settings/AdminAuditLogSection";
import { DOCTOR_PAGE_CONTAINER_CLASS } from "@/shared/ui/doctorWorkspaceLayout";

export default async function DoctorAuditLogPage() {
  await requireAdminDoctorPage();
  return (
    <div className={DOCTOR_PAGE_CONTAINER_CLASS}>
      <h1 className="mb-6 text-xl font-semibold">Журнал операций</h1>
      <AdminAuditLogSection />
    </div>
  );
}
