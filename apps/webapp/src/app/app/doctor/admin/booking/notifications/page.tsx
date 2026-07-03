import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { NOTIF_TEMPLATE_VARIABLES } from "@/modules/notif-templates/notifTemplatesService";
import { NotificationTemplatesPageClient } from "./NotificationTemplatesPageClient";

export default async function DoctorAdminBookingNotificationsPage() {
  const deps = buildAppDeps();
  const templates = await deps.notifTemplates.getAllTemplates();

  return (
    <NotificationTemplatesPageClient templates={templates} variables={[...NOTIF_TEMPLATE_VARIABLES]} />
  );
}
