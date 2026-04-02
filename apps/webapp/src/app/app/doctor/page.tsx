/**
 * Главная страница кабинета специалиста («/app/doctor»).
 * Этап 9: плитки метрик и быстрые ссылки.
 */
import Link from "next/link";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { AppShell } from "@/shared/ui/AppShell";
import { DoctorDashboardContextWidgets } from "./DoctorDashboardContextWidgets";

export default async function DoctorPage() {
  const session = await requireDoctorAccess();
  const deps = buildAppDeps();
  const [dashboard, futureAppointments] = await Promise.all([
    deps.doctorStats.getDashboardMetrics(),
    deps.doctorAppointments.listAppointmentsForSpecialist({ kind: "futureActive" }),
  ]);
  const nearestAppointment = futureAppointments[0]
    ? {
        id: futureAppointments[0].id,
        clientUserId: futureAppointments[0].clientUserId,
        clientLabel: futureAppointments[0].clientLabel,
        time: futureAppointments[0].time,
        type: futureAppointments[0].type,
        scheduleProvenancePrefix: futureAppointments[0].scheduleProvenancePrefix,
      }
    : null;

  return (
    <AppShell title="Обзор" user={session.user} variant="doctor">
      <DoctorDashboardContextWidgets nearestAppointment={nearestAppointment} />
      <section id="doctor-dashboard-patients" className="flex flex-col gap-4 mb-6">
        <h2 className="text-base font-semibold text-muted-foreground">Пациенты</h2>
        <div
          id="doctor-dashboard-patient-tiles"
          className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4"
        >
          <DashboardTile
            id="doctor-dashboard-tile-patients-total"
            href="/app/doctor/clients?scope=all"
            label="Всего в базе"
            value={dashboard.patients.total}
          />
          <DashboardTile
            id="doctor-dashboard-tile-patients-support"
            href="/app/doctor/clients?scope=all&appointment=1"
            label="На сопровождении"
            value={dashboard.patients.onSupport}
            hint="Есть будущая запись"
          />
          <DashboardTile
            id="doctor-dashboard-tile-patients-month"
            href="/app/doctor/clients?scope=appointments&visitedMonth=1"
            label="Были на приёме (месяц)"
            value={dashboard.patients.visitedThisMonth}
            hint="Прошедший слот в текущем UTC-месяце"
          />
        </div>
      </section>

      <section id="doctor-dashboard-appointments" className="flex flex-col gap-4 mb-8">
        <h2 className="text-base font-semibold text-muted-foreground">Записи на приём</h2>
        <div
          id="doctor-dashboard-appointment-tiles"
          className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4"
        >
          <DashboardTile
            id="doctor-dashboard-tile-appt-future"
            href="/app/doctor/appointments?view=future"
            label="Активные (будущие)"
            value={dashboard.appointments.futureActive}
          />
          <DashboardTile
            id="doctor-dashboard-tile-appt-month"
            href="/app/doctor/appointments?view=month"
            label="Всего за месяц"
            value={dashboard.appointments.recordsInMonthTotal}
            hint="По дате приёма, все статусы"
          />
          <DashboardTile
            id="doctor-dashboard-tile-appt-cancel"
            href="/app/doctor/appointments?view=cancellationsMonth"
            label="Отмен за месяц"
            value={dashboard.appointments.cancellationsInMonth}
            hint="По дате фиксации отмены"
          />
        </div>
        <p className="text-sm">
          <Link href="/app/doctor/stats" className="text-primary underline underline-offset-2">
            Открыть статистику
          </Link>
        </p>
      </section>

    </AppShell>
  );
}

function DashboardTile({
  id,
  href,
  label,
  value,
  hint,
}: {
  id: string;
  href: string;
  label: string;
  value: number;
  hint?: string;
}) {
  return (
    <Link
      id={id}
      href={href}
      className="rounded-xl border border-border/60 bg-card p-4 shadow-sm flex flex-col justify-between gap-1 transition-colors hover:bg-muted/40"
    >
      <span className="text-2xl font-semibold tabular-nums text-foreground">{value}</span>
      <span className="text-xs font-medium leading-tight text-muted-foreground">{label}</span>
      {hint ? <span className="text-[10px] text-muted-foreground/80">{hint}</span> : null}
    </Link>
  );
}
