/**
 * Рассылки кабинета специалиста («/app/doctor/broadcasts»).
 * Второй релиз: массовые уведомления по категориям и сегментам с preview и аудитом.
 * Сервис doctorBroadcasts уже доступен (preview, execute, listAudit) для будущего UI.
 */
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { AppShell } from "@/shared/ui/AppShell";

export default async function DoctorBroadcastsPage() {
  const session = await requireDoctorAccess();
  const deps = buildAppDeps();
  const categories = deps.doctorBroadcasts.getCategories();
  const audit = await deps.doctorBroadcasts.listAudit(5);
  return (
    <AppShell title="Рассылки" user={session.user} variant="doctor">
      <section id="doctor-broadcasts-overview-section" className="panel stack">
        <p className="empty-state">
          Массовые рассылки во втором релизе: категория, выбор аудитории, предпросмотр и журнал отправок.
        </p>
        <p className="text-secondary" style={{ fontSize: "0.9rem" }}>
          Категории: {categories.join(", ")}. Журнал рассылок: {audit.length} записей.
        </p>
      </section>
    </AppShell>
  );
}
