/**
 * Статистика кабинета специалиста («/app/doctor/stats»).
 */
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { AppShell } from "@/shared/ui/AppShell";

export default async function DoctorStatsPage() {
  const session = await requireDoctorAccess();
  const deps = buildAppDeps();
  const stats = await deps.doctorStats.getStats();

  return (
    <AppShell title="Статистика" user={session.user} variant="doctor">
      <section className="panel stack">
        <h2>Записи (неделя)</h2>
        <ul className="list" style={{ listStyle: "none", padding: 0, margin: 0 }}>
          <li>Всего записей: {stats.appointments.total}</li>
          <li>Отмен: {stats.appointments.cancellations}</li>
          <li>Отмен за 30 дн.: {stats.appointments.cancellations30d}</li>
          <li>Переносов: {stats.appointments.reschedules}</li>
        </ul>
      </section>
      <section className="panel stack">
        <h2>Клиенты</h2>
        <ul className="list" style={{ listStyle: "none", padding: 0, margin: 0 }}>
          <li>Всего: {stats.clients.total}</li>
          <li>Без каналов связи: {stats.clients.withNoChannels}</li>
          <li>С одним каналом: {stats.clients.withOneChannel}</li>
          <li>С несколькими каналами: {stats.clients.withMultipleChannels}</li>
        </ul>
      </section>
    </AppShell>
  );
}
