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
  return (
    <AppShell title="Обзор" user={session.user} variant="doctor">
      <div className="kpi-grid">
        <div className="kpi-card panel">
          <span className="kpi-card__value">{appointmentsToday.length}</span>
          <span className="kpi-card__label eyebrow">Записей сегодня</span>
        </div>
        <div className="kpi-card panel">
          <span className="kpi-card__value">{stats.clients.total}</span>
          <span className="kpi-card__label eyebrow">Клиентов в базе</span>
        </div>
        <div className="kpi-card panel">
          <span className="kpi-card__value">{stats.appointments.cancellations30d}</span>
          <span className="kpi-card__label eyebrow">Отмен за 30 дн.</span>
        </div>
        <div className="kpi-card panel">
          <span className="kpi-card__value">{stats.clients.withNoChannels}</span>
          <span className="kpi-card__label eyebrow">Без канала связи</span>
        </div>
      </div>

      <div className="overview-columns">
        <section className="panel stack">
          <h2>Ближайшие записи</h2>
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
          <h2>Требуют внимания</h2>
          {stats.clients.withNoChannels > 0 ? (
            <p>
              Клиентов без канала связи:{" "}
              <Link href="/app/doctor/clients">{stats.clients.withNoChannels}</Link>
            </p>
          ) : null}
          {(() => {
            const withCancellations = clients.filter((c) => c.cancellationCount30d > 2).slice(0, 5);
            if (withCancellations.length === 0 && stats.clients.withNoChannels === 0) {
              return <p className="empty-state">Нет клиентов, требующих внимания.</p>;
            }
            return withCancellations.length > 0 ? (
              <ul className="list">
                {withCancellations.map((c) => (
                  <li key={c.userId} className="list-item">
                    <Link href={`/app/doctor/clients/${c.userId}`}>
                      {c.displayName} — {c.cancellationCount30d} отмен за 30 дн.
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null;
          })()}
        </section>
      </div>

      <section className="panel stack">
        <h2>Быстрые действия</h2>
        <div className="feature-grid feature-grid--compact">
          <Link href="/app/doctor/clients" className="button">
            Клиенты
          </Link>
          <Link href="/app/doctor/appointments" className="button">
            Записи
          </Link>
          <Link href="/app/doctor/messages" className="button">
            Сообщения
          </Link>
          <Link href="/app/doctor/stats" className="button">
            Статистика
          </Link>
        </div>
      </section>
    </AppShell>
  );
}
