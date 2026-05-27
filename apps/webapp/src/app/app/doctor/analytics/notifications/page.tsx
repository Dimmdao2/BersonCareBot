import { requireAdminDoctorPage } from "@/app/app/settings/requireAdminDoctorPage";
import { ReminderStatsSection } from "@/app/app/settings/ReminderStatsSection";
import { DOCTOR_PAGE_CONTAINER_CLASS } from "@/shared/ui/doctorWorkspaceLayout";

export default async function DoctorAnalyticsNotificationsPage() {
  await requireAdminDoctorPage();
  return (
    <div className={DOCTOR_PAGE_CONTAINER_CLASS}>
      <h1 className="mb-6 text-xl font-semibold">По уведомлениям</h1>
      <ReminderStatsSection />
    </div>
  );
}
