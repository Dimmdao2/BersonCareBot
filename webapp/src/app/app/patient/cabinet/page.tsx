import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requirePatientAccess } from "@/app-layer/guards/requireRole";
import { AppShell } from "@/shared/ui/AppShell";

export default async function PatientCabinetPage() {
  const session = await requirePatientAccess();
  const deps = buildAppDeps();
  const cabinet = deps.patientCabinet.getPatientCabinetState();
  const appointments = deps.patientCabinet.getUpcomingAppointments();

  return (
    <AppShell title="Кабинет клиента" user={session.user}>
      <section className="hero-card stack">
        <p>{cabinet.reason}</p>
        {cabinet.enabled ? null : <p className="empty-state">Раздел пока не активирован для текущего пользователя.</p>}
      </section>
      <section className="panel stack">
        <h2>Ближайшие записи</h2>
        {appointments.length === 0 ? (
          <p className="empty-state">В MVP список записей появится после подключения реального appointment bridge.</p>
        ) : (
          <ul className="list">
            {appointments.map((appointment) => (
              <li key={appointment.label} className="list-item">
                {appointment.label}
              </li>
            ))}
          </ul>
        )}
      </section>
    </AppShell>
  );
}
