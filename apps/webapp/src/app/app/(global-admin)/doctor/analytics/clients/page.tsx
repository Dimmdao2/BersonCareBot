/**
 * Аналитика по клиентам (/app/doctor/analytics/clients).
 */
import { requirePlatformOperationsPage } from "@/app-layer/guards/requireRole";
import { DoctorAppShell } from "@/shared/ui/doctor/DoctorAppShell";
import { DoctorEmptyState } from "@/shared/ui/doctor/DoctorEmptyState";

export default async function DoctorAnalyticsClientsPage() {
  const session = await requirePlatformOperationsPage();
  return (
    <DoctorAppShell title="Аналитика платформы" user={session.user}>
      <DoctorEmptyState title="Клинические карточки и контакты недоступны в platform mode" />
    </DoctorAppShell>
  );
}
