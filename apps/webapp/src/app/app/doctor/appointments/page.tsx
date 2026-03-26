/**
 * Список записей кабинета специалиста («/app/doctor/appointments»).
 */
import Link from "next/link";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { AppShell } from "@/shared/ui/AppShell";
import { DoctorAppointmentActions } from "./DoctorAppointmentActions";

export default async function DoctorAppointmentsPage() {
  const session = await requireDoctorAccess();
  const deps = buildAppDeps();
  const [appointments, stats] = await Promise.all([
    deps.doctorAppointments.listAppointmentsForSpecialist({ range: "today" }),
    deps.doctorAppointments.getAppointmentStats({ range: "today" }),
  ]);

  return (
    <AppShell title="Записи" user={session.user} variant="doctor">
      <section id="doctor-appointments-stats-section" className="rounded-2xl border border-border bg-card p-4 shadow-sm flex flex-col gap-4">
        <h2>Статистика (сегодня)</h2>
        <ul id="doctor-appointments-stats-list" className="m-0 list-none space-y-3 p-0">
          <li id="doctor-appointments-stats-total">Записей: {stats.total}</li>
          <li id="doctor-appointments-stats-cancellations-30d">Отмен за 30 дн.: {stats.cancellations30d}</li>
          <li id="doctor-appointments-stats-reschedules">Переносов: {stats.reschedules}</li>
        </ul>
      </section>
      <section id="doctor-appointments-upcoming-section" className="rounded-2xl border border-border bg-card p-4 shadow-sm flex flex-col gap-4">
        <h2>Ближайшие записи</h2>
        {appointments.length === 0 ? (
          <p className="text-muted-foreground">Нет записей на выбранный период.</p>
        ) : (
          <ul id="doctor-appointments-upcoming-list" className="m-0 list-none space-y-3 p-0">
            {appointments.map((a) => (
              <li key={a.id} id={`doctor-appointments-item-${a.id}`} className="rounded-lg border border-border bg-card p-3">
                <div className="flex flex-col gap-2">
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
