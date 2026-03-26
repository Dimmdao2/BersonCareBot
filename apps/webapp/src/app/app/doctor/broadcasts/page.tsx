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
      <section id="doctor-broadcasts-overview-section" className="rounded-2xl border border-border bg-card p-4 shadow-sm flex flex-col gap-4">
        <p className="text-muted-foreground">
          Массовые рассылки во втором релизе: категория, выбор аудитории, предпросмотр и журнал отправок.
        </p>
        <p className="text-sm text-secondary">
          Категории: {categories.join(", ")}. Журнал рассылок: {audit.length} записей.
        </p>
      </section>
    </AppShell>
  );
}
