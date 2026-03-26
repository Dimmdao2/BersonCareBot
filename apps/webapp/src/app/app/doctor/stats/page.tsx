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
      <section id="doctor-stats-appointments-section" className="rounded-2xl border border-border bg-card p-4 shadow-sm flex flex-col gap-4">
        <h2>Записи (неделя)</h2>
        <ul id="doctor-stats-appointments-list" className="m-0 list-none space-y-3 p-0">
          <li id="doctor-stats-appointments-total">Всего записей: {stats.appointments.total}</li>
          <li id="doctor-stats-appointments-cancellations">Отмен: {stats.appointments.cancellations}</li>
          <li id="doctor-stats-appointments-cancellations-30d">Отмен за 30 дн.: {stats.appointments.cancellations30d}</li>
          <li id="doctor-stats-appointments-reschedules">Переносов: {stats.appointments.reschedules}</li>
        </ul>
      </section>
      <section id="doctor-stats-clients-section" className="rounded-2xl border border-border bg-card p-4 shadow-sm flex flex-col gap-4">
        <h2>Клиенты</h2>
        <ul id="doctor-stats-clients-list" className="m-0 list-none space-y-3 p-0">
          <li id="doctor-stats-clients-total">Всего: {stats.clients.total}</li>
          <li id="doctor-stats-clients-without-channels">Без каналов связи: {stats.clients.withNoChannels}</li>
          <li id="doctor-stats-clients-with-one-channel">С одним каналом: {stats.clients.withOneChannel}</li>
          <li id="doctor-stats-clients-with-multiple-channels">С несколькими каналами: {stats.clients.withMultipleChannels}</li>
        </ul>
      </section>
    </AppShell>
  );
}
