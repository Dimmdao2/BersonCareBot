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
  const [stats, clients, appointmentsToday] = await Promise.all([
    deps.doctorStats.getStats(),
    deps.doctorClients.listClients({}),
    deps.doctorAppointments.listAppointmentsForSpecialist({ range: "today" }),
  ]);
  const recentClients = clients.slice(0, 8);

  return (
    <AppShell title="Обзор" user={session.user} titleSmall>
      <section className="panel stack">
        <h2>Кабинет специалиста</h2>
        <ul className="list" style={{ listStyle: "none", padding: 0, margin: 0 }}>
          <li>Клиентов в базе: {stats.clients.total}</li>
          <li>Записей на сегодня: {appointmentsToday.length}</li>
          <li>Отмен за 30 дней: {stats.appointments.cancellations30d}</li>
          <li>Клиентов без канала связи: {stats.clients.withNoChannels}</li>
        </ul>
      </section>

      <section className="panel stack">
        <h2>Сегодняшние записи</h2>
        {appointmentsToday.length === 0 ? (
          <p className="empty-state">Нет ближайших записей.</p>
        ) : (
          <ul className="list">
            {appointmentsToday.map((a) => (
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
        <h2>Клиенты</h2>
        {recentClients.length === 0 ? (
          <p className="empty-state">Пока нет клиентов в платформенном справочнике.</p>
        ) : (
          <ul className="list">
            {recentClients.map((r) => (
              <li key={r.userId} className="list-item">
                <Link href={`/app/doctor/clients/${r.userId}`}>{r.displayName}</Link>
                <span className="eyebrow">
                  {" "}
                  — {r.phone ?? "без телефона"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel stack">
        <h2>Быстрые действия</h2>
        <ul className="doctor-nav__list" style={{ listStyle: "none", padding: 0, margin: 0 }}>
          <li style={{ marginBottom: "0.5rem" }}>
            <Link href="/app/doctor/clients" className="button">
              Открыть клиентов
            </Link>
          </li>
          <li style={{ marginBottom: "0.5rem" }}>
            <Link href="/app/doctor/appointments" className="button">
              Открыть записи
            </Link>
          </li>
          <li style={{ marginBottom: "0.5rem" }}>
            <Link href="/app/doctor/messages" className="button">
              Сообщения
            </Link>
          </li>
          <li style={{ marginBottom: "0.5rem" }}>
            <Link href="/app/doctor/stats" className="button">
              Статистика
            </Link>
          </li>
        </ul>
      </section>
    </AppShell>
  );
}
