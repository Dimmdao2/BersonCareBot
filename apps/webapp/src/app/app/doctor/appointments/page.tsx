/**
 * Список записей кабинета специалиста («/app/doctor/appointments»).
 * Query `view`: по умолчанию записи на сегодня; `future` | `month` | `cancellationsMonth` — как плитки дашборда.
 */
import Link from "next/link";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import type { DoctorAppointmentsListFilter } from "@/modules/doctor-appointments/ports";
import { AppShell } from "@/shared/ui/AppShell";
import { DoctorAppointmentActions } from "./DoctorAppointmentActions";

function parseListFilter(view: string | undefined): DoctorAppointmentsListFilter {
  if (view === "future") return { kind: "futureActive" };
  if (view === "month") return { kind: "recordsInCalendarMonth" };
  if (view === "cancellationsMonth") return { kind: "cancellationsInCalendarMonth" };
  return { kind: "range", range: "today" };
}

function listSectionTitle(view: string | undefined): string {
  switch (view) {
    case "future":
      return "Активные будущие записи";
    case "month":
      return "Все записи за текущий месяц (по дате приёма)";
    case "cancellationsMonth":
      return "Отмены за текущий месяц (по дате фиксации отмены)";
    default:
      return "Ближайшие записи";
  }
}

type Props = {
  searchParams: Promise<{ view?: string }>;
};

export default async function DoctorAppointmentsPage({ searchParams }: Props) {
  const session = await requireDoctorAccess();
  const deps = buildAppDeps();
  const params = await searchParams;
  const view = params.view;
  const listFilter = parseListFilter(view);
  const [appointments, stats] = await Promise.all([
    deps.doctorAppointments.listAppointmentsForSpecialist(listFilter),
    deps.doctorAppointments.getAppointmentStats({ range: "today" }),
  ]);

  return (
    <AppShell title="Записи" user={session.user} variant="doctor">
      <section id="doctor-appointments-stats-section" className="rounded-2xl border border-border bg-card p-4 shadow-sm flex flex-col gap-4">
        <h2>Статистика (сегодня)</h2>
        <p className="text-muted-foreground text-sm">
          Сводка ниже — по окну «сегодня» (UTC). Список может быть в другом режиме — см. заголовок блока записей.
        </p>
        <ul id="doctor-appointments-stats-list" className="m-0 list-none space-y-3 p-0">
          <li id="doctor-appointments-stats-total">Записей (сегодня, все статусы кроме soft-delete): {stats.total}</li>
          <li id="doctor-appointments-stats-cancellations-30d">Отмен за 30 дн.: {stats.cancellations30d}</li>
          <li id="doctor-appointments-stats-reschedules">Переносов (статус updated, сегодня): {stats.reschedules}</li>
        </ul>
      </section>
      <section id="doctor-appointments-upcoming-section" className="rounded-2xl border border-border bg-card p-4 shadow-sm flex flex-col gap-4">
        <h2>{listSectionTitle(view)}</h2>
        {appointments.length === 0 ? (
          <p className="text-muted-foreground">Нет записей на выбранный период.</p>
        ) : (
          <ul id="doctor-appointments-upcoming-list" className="m-0 list-none space-y-3 p-0">
            {appointments.map((a) => (
              <li key={a.id} id={`doctor-appointments-item-${a.id}`} className="rounded-lg border border-border bg-card p-3">
                <div className="flex flex-col gap-2">
                  {a.scheduleProvenancePrefix ? (
                    <p className="text-xs text-muted-foreground">{a.scheduleProvenancePrefix}</p>
                  ) : null}
                  <Link href={`/app/doctor/clients/${a.clientUserId}`}>
                    {a.time} — {a.clientLabel} ({a.type}, {a.status})
                  </Link>
                  <DoctorAppointmentActions recordId={a.id} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </AppShell>
  );
}
