/**
 * Страница «Кабинет клиента» («/app/patient/cabinet»).
 * Только для пациента. Показывает краткое описание кабинета (причина обращения и т.п.),
 * метку ближайшей записи и блок «Ближайшие записи» — список предстоящих приёмов со ссылками.
 * Кнопка «Назад» ведёт в главное меню пациента.
 */

import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requirePatientAccess } from "@/app-layer/guards/requireRole";
import { AppShell } from "@/shared/ui/AppShell";

/** Рендерит кабинет: описание, следующая запись и список ближайших записей. */
export default async function PatientCabinetPage() {
  const session = await requirePatientAccess();
  const deps = buildAppDeps();
  const userId = session.user.userId;
  const cabinet = deps.patientCabinet.getPatientCabinetState(userId);
  const appointments = deps.patientCabinet.getUpcomingAppointments(userId);

  return (
    <AppShell title="Кабинет клиента" user={session.user} backHref="/app/patient" backLabel="Меню">
      <section className="hero-card stack">
        <p>{cabinet.reason}</p>
        {cabinet.nextAppointmentLabel ? <p className="empty-state">{cabinet.nextAppointmentLabel}</p> : null}
      </section>
      <section className="panel stack">
        <h2>Ближайшие записи</h2>
        {appointments.length === 0 ? (
          <p className="empty-state">Список записей появится после подключения к системе записи.</p>
        ) : (
          <ul className="list">
            {appointments.map((appointment) => (
              <li key={appointment.id} className="list-item">
                {appointment.link ? <a href={appointment.link}>{appointment.label}</a> : appointment.label}
              </li>
            ))}
          </ul>
        )}
      </section>
    </AppShell>
  );
}
