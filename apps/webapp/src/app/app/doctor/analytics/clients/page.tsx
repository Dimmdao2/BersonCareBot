/**
 * Аналитика по клиентам (/app/doctor/analytics/clients).
 * Агрегаты по записям — окно «неделя» от UTC-полуночи сегодня; см. DOCTOR_DASHBOARD_METRICS.md.
 */
import { DateTime } from "luxon";
import { redirect } from "next/navigation";

import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { getAppDisplayTimeZone } from "@/modules/system-settings/appDisplayTimezone";
import { AppShell } from "@/shared/ui/AppShell";
import { AdminPlatformRegistrationStatsClient } from "./AdminPlatformRegistrationStatsClient";
import { AdminPlatformSubscriberStatsClient } from "./AdminPlatformSubscriberStatsClient";
import { DoctorStatCard } from "./DoctorStatCard";

export default async function DoctorAnalyticsClientsPage() {
  const session = await requireDoctorAccess();
  if (session.user.role !== "admin") {
    redirect("/app/doctor");
  }
  const deps = buildAppDeps();
  const stats = await deps.doctorStats.getStats();
  const tz = await getAppDisplayTimeZone();
  const calendarTodayYmd = DateTime.now().setZone(tz).toFormat("yyyy-LL-dd");

  return (
    <AppShell title="По клиентам" user={session.user} variant="doctor">
      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <AdminPlatformSubscriberStatsClient calendarTodayYmd={calendarTodayYmd} />
        <AdminPlatformRegistrationStatsClient calendarTodayYmd={calendarTodayYmd} />
      </div>
      <section
        id="doctor-stats-appointments-section"
        className="rounded-2xl border border-border bg-card p-4 shadow-sm flex flex-col gap-4"
      >
        <h2>Записи (неделя, UTC)</h2>
        <p className="text-muted-foreground text-sm">
          Интервал: с начала сегодняшнего UTC-дня по конец 7-го дня. Учитываются только строки без soft-delete.
          «Всего» включает отменённые слоты в этом окне; «Отмен» — подмножество с учётом фильтра по last_event.
        </p>
        <div id="doctor-stats-appointments-cards" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <DoctorStatCard id="doctor-stats-appointments-total" title="Всего записей" value={stats.appointments.total} />
          <DoctorStatCard
            id="doctor-stats-appointments-cancellations"
            title="Отмен в окне"
            value={stats.appointments.cancellations}
            tone="warning"
          />
          <DoctorStatCard
            id="doctor-stats-appointments-cancellations-30d"
            title="Отмен за 30 дн."
            value={stats.appointments.cancellations30d}
            tone="warning"
            href="/app/doctor/appointments?view=cancellationsMonth"
          />
          <DoctorStatCard
            id="doctor-stats-appointments-reschedules"
            title="Переносов (updated)"
            value={stats.appointments.reschedules}
          />
        </div>
      </section>
      <section
        id="doctor-stats-clients-section"
        className="rounded-2xl border border-border bg-card p-4 shadow-sm flex flex-col gap-4"
      >
        <h2>Клиенты</h2>
        <div id="doctor-stats-clients-cards" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <DoctorStatCard id="doctor-stats-clients-total" title="Всего клиентов" value={stats.clients.total} />
          <DoctorStatCard
            id="doctor-stats-clients-without-channels"
            title="Без каналов связи"
            value={stats.clients.withNoChannels}
            tone="warning"
          />
          <DoctorStatCard
            id="doctor-stats-clients-with-one-channel"
            title="С одним каналом"
            value={stats.clients.withOneChannel}
          />
          <DoctorStatCard
            id="doctor-stats-clients-with-multiple-channels"
            title="С несколькими каналами"
            value={stats.clients.withMultipleChannels}
          />
        </div>
      </section>
    </AppShell>
  );
}
