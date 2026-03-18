/**
 * Рассылки кабинета специалиста («/app/doctor/broadcasts»).
 * Второй релиз: массовые уведомления по категориям и сегментам с preview и аудитом.
 */
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { AppShell } from "@/shared/ui/AppShell";

export default async function DoctorBroadcastsPage() {
  const session = await requireDoctorAccess();
  return (
    <AppShell title="Рассылки" user={session.user} titleSmall>
      <section className="panel stack">
        <p className="empty-state">
          Массовые рассылки будут добавлены во втором релизе: категория, выбор аудитории, предпросмотр и журнал отправок.
        </p>
      </section>
    </AppShell>
  );
}
