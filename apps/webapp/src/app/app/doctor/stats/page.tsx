/**
 * Статистика кабинета специалиста («/app/doctor/stats»).
 * Агрегаты по записям — окно «неделя» от UTC-полуночи сегодня; см. DOCTOR_DASHBOARD_METRICS.md.
 */
import Link from "next/link";
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
        <h2>Записи (неделя, UTC)</h2>
        <p className="text-muted-foreground text-sm">
          Интервал: с начала сегодняшнего UTC-дня по конец 7-го дня. Учитываются только строки без soft-delete. «Всего» включает
          отменённые слоты в этом окне; «Отмен» — подмножество с учётом фильтра по last_event.
        </p>
        <ul id="doctor-stats-appointments-list" className="m-0 list-none space-y-3 p-0">
          <li id="doctor-stats-appointments-total">Всего записей: {stats.appointments.total}</li>
          <li id="doctor-stats-appointments-cancellations">Отмен в окне: {stats.appointments.cancellations}</li>
          <li id="doctor-stats-appointments-cancellations-30d">Отмен за 30 дн.: {stats.appointments.cancellations30d}</li>
          <li id="doctor-stats-appointments-reschedules">Переносов (status updated): {stats.appointments.reschedules}</li>
        </ul>
        <p className="text-sm">
          <Link
            href="/app/doctor/appointments?view=cancellationsMonth"
            className="text-primary underline underline-offset-2"
          >
            Список отмен за текущий месяц
          </Link>
        </p>
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
