import { requireAdminDoctorPage } from "@/app/app/settings/requireAdminDoctorPage";
import { SystemHealthSection } from "@/app/app/settings/SystemHealthSection";
import { DOCTOR_PAGE_CONTAINER_CLASS } from "@/shared/ui/doctorWorkspaceLayout";

export default async function DoctorSystemHealthPage() {
  await requireAdminDoctorPage();
  return (
    <div className={DOCTOR_PAGE_CONTAINER_CLASS}>
      <h1 className="mb-6 text-xl font-semibold">Здоровье системы</h1>
      <SystemHealthSection />
    </div>
  );
}
