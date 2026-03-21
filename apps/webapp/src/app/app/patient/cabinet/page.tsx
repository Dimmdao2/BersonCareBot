/**
 * Страница «Кабинет клиента» («/app/patient/cabinet»).
 * Только для пациента. Показывает краткое описание кабинета (причина обращения и т.п.),
 * метку ближайшей записи и блок «Ближайшие записи» — список предстоящих приёмов со ссылками.
 * Кнопка «Назад» ведёт в главное меню пациента.
 */

import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requirePatientAccess, requirePatientPhone } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";
import { AppShell } from "@/shared/ui/AppShell";

function isSafeHref(url: string): boolean {
  try {
    const parsed = new URL(url, "https://placeholder.invalid");
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

/** Рендерит кабинет: описание, следующая запись и список ближайших записей. Требуется привязка телефона. */
export default async function PatientCabinetPage() {
  const session = await requirePatientAccess(routePaths.cabinet);
  requirePatientPhone(session, routePaths.cabinet);
  const deps = buildAppDeps();
  const userId = session.user.userId;
  const [cabinet, appointments] = await Promise.all([
    deps.patientCabinet.getPatientCabinetState(userId),
    deps.patientCabinet.getUpcomingAppointments(userId),
  ]);

  return (
    <AppShell title="Кабинет клиента" user={session.user} backHref="/app/patient" backLabel="Меню" variant="patient">
      {cabinet.enabled && (
        <section id="patient-cabinet-hero-section" className="hero-card stack">
          <p>{cabinet.reason}</p>
          {cabinet.nextAppointmentLabel ? <p className="empty-state">{cabinet.nextAppointmentLabel}</p> : null}
        </section>
      )}
      <section id="patient-cabinet-upcoming-appointments-section" className="panel stack">
        <h2>Ближайшие записи</h2>
        {appointments.length === 0 ? (
          <p className="empty-state">Список записей появится после подключения к системе записи.</p>
        ) : (
          <ul id="patient-cabinet-upcoming-appointments-list" className="list">
            {appointments.map((appointment) => (
              <li
                key={appointment.id}
                id={`patient-cabinet-appointment-item-${appointment.id}`}
                className="list-item"
              >
                {appointment.link && isSafeHref(appointment.link) ? (
                  <a href={appointment.link} target="_blank" rel="noopener noreferrer">
                    {appointment.label}
                  </a>
                ) : (
                  appointment.label
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </AppShell>
  );
}
