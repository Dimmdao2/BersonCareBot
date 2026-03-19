/**
 * Список записей кабинета специалиста («/app/doctor/appointments»).
 */
import Link from "next/link";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { AppShell } from "@/shared/ui/AppShell";

export default async function DoctorAppointmentsPage() {
  const session = await requireDoctorAccess();
  const deps = buildAppDeps();
  const [appointments, stats] = await Promise.all([
    deps.doctorAppointments.listAppointmentsForSpecialist({ range: "today" }),
    deps.doctorAppointments.getAppointmentStats({ range: "today" }),
  ]);

  return (
    <AppShell title="Записи" user={session.user} variant="doctor">
      <section id="doctor-appointments-stats-section" className="panel stack">
        <h2>Статистика (сегодня)</h2>
        <ul id="doctor-appointments-stats-list" className="list" style={{ listStyle: "none", padding: 0, margin: 0 }}>
          <li id="doctor-appointments-stats-total">Записей: {stats.total}</li>
          <li id="doctor-appointments-stats-cancellations-30d">Отмен за 30 дн.: {stats.cancellations30d}</li>
          <li id="doctor-appointments-stats-reschedules">Переносов: {stats.reschedules}</li>
        </ul>
      </section>
      <section id="doctor-appointments-upcoming-section" className="panel stack">
        <h2>Ближайшие записи</h2>
        {appointments.length === 0 ? (
          <p className="empty-state">Нет записей на выбранный период.</p>
        ) : (
          <ul id="doctor-appointments-upcoming-list" className="list">
            {appointments.map((a) => (
              <li key={a.id} id={`doctor-appointments-item-${a.id}`} className="list-item">
                <Link href={`/app/doctor/clients/${a.clientUserId}`}>
                  {a.time} — {a.clientLabel} ({a.type}, {a.status})
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </AppShell>
  );
}
