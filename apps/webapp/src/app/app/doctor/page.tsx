/**
 * Обзорная страница кабинета специалиста («/app/doctor»).
 * Показывается только пользователям с ролью врач или админ. Блоки: мой день, ближайшие записи,
 * требуют внимания, последние события, быстрые действия.
 */

import Link from "next/link";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { AppShell } from "@/shared/ui/AppShell";

/** Строит обзорную страницу врача. */
export default async function DoctorPage() {
  const session = await requireDoctorAccess();
  const deps = buildAppDeps();
  const overview = deps.doctorCabinet.getOverviewState();

  return (
    <AppShell title="Обзор" user={session.user} titleSmall>
      <section className="panel stack">
        <h2>Мой день</h2>
        <ul className="list" style={{ listStyle: "none", padding: 0, margin: 0 }}>
          <li>Записей на сегодня: {overview.myDay.appointmentsToday}</li>
          {overview.myDay.nearestAppointmentLabel && (
            <li>Ближайшая: {overview.myDay.nearestAppointmentLabel}</li>
          )}
          <li>Отмен за сегодня: {overview.myDay.cancellationsToday}</li>
          <li>Переносов за сегодня: {overview.myDay.reschedulesToday}</li>
        </ul>
      </section>

      <section className="panel stack">
        <h2>Ближайшие записи</h2>
        {overview.nearestAppointments.length === 0 ? (
          <p className="empty-state">Нет ближайших записей.</p>
        ) : (
          <ul className="list">
            {overview.nearestAppointments.map((a) => (
              <li key={a.id} className="list-item">
                <Link href={`/app/doctor/clients/${a.clientUserId}`}>
                  {a.time} — {a.clientLabel} ({a.type}, {a.status})
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel stack">
        <h2>Требуют внимания</h2>
        {overview.requireAttention.length === 0 ? (
          <p className="empty-state">Нет клиентов, требующих внимания.</p>
        ) : (
          <ul className="list">
            {overview.requireAttention.map((r) => (
              <li key={r.id} className="list-item">
                <Link href={`/app/doctor/clients/${r.clientUserId}`}>{r.clientLabel}</Link>
                <span className="eyebrow"> — {r.kind}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel stack">
        <h2>Быстрые действия</h2>
        <ul className="doctor-nav__list" style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {overview.quickActions.map((a) => (
            <li key={a.id} style={{ marginBottom: "0.5rem" }}>
              <Link href={a.href} className="button">
                {a.label}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </AppShell>
  );
}
