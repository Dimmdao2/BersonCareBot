/**
 * Главная страница кабинета специалиста («/app/doctor»).
 * Этап 9: плитки метрик и быстрые ссылки.
 */
import Link from "next/link";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { buttonVariants } from "@/components/ui/button";
import { AppShell } from "@/shared/ui/AppShell";

export default async function DoctorPage() {
  const session = await requireDoctorAccess();
  const deps = buildAppDeps();
  const dashboard = await deps.doctorStats.getDashboardMetrics();

  return (
    <AppShell title="Обзор" user={session.user} variant="doctor">
      <section id="doctor-dashboard-patients" className="stack mb-6">
        <h2 className="text-base font-semibold text-muted-foreground">Пациенты</h2>
        <div
          id="doctor-dashboard-patient-tiles"
          className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4"
        >
          <DashboardTile
            id="doctor-dashboard-tile-patients-total"
            href="/app/doctor/subscribers"
            label="Всего в базе"
            value={dashboard.patients.total}
          />
          <DashboardTile
            id="doctor-dashboard-tile-patients-support"
            href="/app/doctor/subscribers?appointment=1"
            label="На сопровождении"
            value={dashboard.patients.onSupport}
            hint="Есть будущая запись"
          />
          <DashboardTile
            id="doctor-dashboard-tile-patients-month"
            href="/app/doctor/clients"
            label="Приходили в этом месяце"
            value={dashboard.patients.visitedThisMonth}
            hint="По записям в календарном месяце"
          />
        </div>
      </section>

      <section id="doctor-dashboard-appointments" className="stack mb-8">
        <h2 className="text-base font-semibold text-muted-foreground">Записи на приём</h2>
        <div
          id="doctor-dashboard-appointment-tiles"
          className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4"
        >
          <DashboardTile
            id="doctor-dashboard-tile-appt-future"
            href="/app/doctor/appointments"
            label="Активные (будущие)"
            value={dashboard.appointments.futureActive}
          />
          <DashboardTile
            id="doctor-dashboard-tile-appt-month"
            href="/app/doctor/appointments"
            label="Всего за месяц"
            value={dashboard.appointments.recordsInMonthTotal}
          />
          <DashboardTile
            id="doctor-dashboard-tile-appt-cancel"
            href="/app/doctor/stats"
            label="Отмен за месяц"
            value={dashboard.appointments.cancellationsInMonth}
          />
        </div>
        <p className="text-sm">
          <Link href="/app/doctor/stats" className="text-primary underline underline-offset-2">
            Открыть статистику
          </Link>
        </p>
      </section>

      <section
        id="doctor-dashboard-quick-actions"
        className="rounded-xl border border-border/60 bg-background p-4 shadow-sm flex flex-col gap-3"
      >
        <h2 className="text-lg font-semibold">Быстрые действия</h2>
        <div className="flex flex-wrap gap-2">
          <Link
            id="doctor-dashboard-action-subscribers"
            href="/app/doctor/subscribers"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Подписчики
          </Link>
          <Link
            id="doctor-dashboard-action-clients"
            href="/app/doctor/clients"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Клиенты
          </Link>
          <Link
            id="doctor-dashboard-action-appointments"
            href="/app/doctor/appointments"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Записи
          </Link>
          <Link
            id="doctor-dashboard-action-messages"
            href="/app/doctor/messages"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Сообщения
          </Link>
          <Link
            id="doctor-dashboard-action-stats"
            href="/app/doctor/stats"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Статистика
          </Link>
        </div>
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
      className="panel flex flex-col justify-between gap-1 rounded-xl border border-border/60 p-4 shadow-sm transition-colors hover:bg-muted/40"
    >
      <span className="text-2xl font-semibold tabular-nums text-foreground">{value}</span>
      <span className="text-xs font-medium leading-tight text-muted-foreground">{label}</span>
      {hint ? <span className="text-[10px] text-muted-foreground/80">{hint}</span> : null}
    </Link>
  );
}
