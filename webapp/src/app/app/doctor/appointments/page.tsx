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
    <AppShell title="Записи" user={session.user} titleSmall>
      <section className="panel stack">
        <h2>Статистика (сегодня)</h2>
        <ul className="list" style={{ listStyle: "none", padding: 0, margin: 0 }}>
          <li>Записей: {stats.total}</li>
          <li>Отмен за 30 дн.: {stats.cancellations30d}</li>
          <li>Переносов: {stats.reschedules}</li>
        </ul>
      </section>
      <section className="panel stack">
        <h2>Ближайшие записи</h2>
        {appointments.length === 0 ? (
          <p className="empty-state">Нет записей на выбранный период.</p>
        ) : (
          <ul className="list">
            {appointments.map((a) => (
              <li key={a.id} className="list-item">
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
