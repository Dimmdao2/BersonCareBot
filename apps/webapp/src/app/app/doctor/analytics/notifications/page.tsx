import { requireAdminDoctorPage } from "@/app/app/settings/requireAdminDoctorPage";
import { NotificationsAnalyticsClient } from "@/app/app/doctor/analytics/notifications/NotificationsAnalyticsClient";
import { DOCTOR_PAGE_CONTAINER_CLASS } from "@/shared/ui/doctorWorkspaceLayout";

export default async function DoctorAnalyticsNotificationsPage() {
  await requireAdminDoctorPage();
  return (
    <div className={DOCTOR_PAGE_CONTAINER_CLASS}>
      <h1 className="mb-6 text-xl font-semibold">По уведомлениям</h1>
      <NotificationsAnalyticsClient />
    </div>
  );
}
