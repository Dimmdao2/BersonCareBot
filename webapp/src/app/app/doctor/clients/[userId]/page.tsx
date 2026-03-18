/**
 * Карточка клиента кабинета специалиста («/app/doctor/clients/[userId]»).
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { AppShell } from "@/shared/ui/AppShell";

type Props = { params: Promise<{ userId: string }> };

export default async function DoctorClientProfilePage({ params }: Props) {
  const session = await requireDoctorAccess();
  const { userId } = await params;
  const deps = buildAppDeps();
  const profile = await deps.doctorClients.getClientProfile(userId);

  if (!profile) notFound();

  const { identity, channelCards, upcomingAppointments, appointmentStats, symptomTrackings, recentSymptomEntries, lfkComplexes, recentLfkSessions } = profile;

  return (
    <AppShell
      title={identity.displayName}
      user={session.user}
      backHref="/app/doctor/clients"
      backLabel="Клиенты"
      titleSmall
    >
      <section className="panel stack">
        <h2>Контакты</h2>
        <p>
          {identity.phone ? `Телефон: ${identity.phone}` : "Телефон не указан"}
        </p>
        <p className="eyebrow">Каналы</p>
        <ul className="list" style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {channelCards.map((ch) => (
            <li key={ch.code}>
              {ch.title}: {ch.isLinked ? "подключён" : "не подключён"}
              {ch.isLinked && (ch.isEnabledForMessages ? ", сообщения вкл." : ", сообщения выкл.")}
            </li>
          ))}
        </ul>
      </section>

      <section className="panel stack">
        <h2>Ближайшие записи</h2>
        {upcomingAppointments.length === 0 ? (
          <p className="empty-state">Нет предстоящих записей.</p>
        ) : (
          <ul className="list">
            {upcomingAppointments.map((a) => (
              <li key={a.id} className="list-item">
                {a.link ? <a href={a.link}>{a.label}</a> : a.label}
              </li>
            ))}
          </ul>
        )}
        <p className="eyebrow">Статистика: всего {appointmentStats.total}, отмен за 30 дн.: {appointmentStats.cancellations30d}</p>
      </section>

      <section className="panel stack">
        <h2>Дневник симптомов</h2>
        {symptomTrackings.length === 0 ? (
          <p className="empty-state">Нет отслеживаемых симптомов.</p>
        ) : (
          <>
            <p>Симптомы: {symptomTrackings.map((t) => t.symptomTitle).join(", ")}</p>
            {recentSymptomEntries.length > 0 && (
              <p>Последние записи: {recentSymptomEntries.slice(0, 5).map((e) => `${e.value0_10}`).join(", ")}</p>
            )}
          </>
        )}
      </section>

      <section className="panel stack">
        <h2>Дневник ЛФК</h2>
        {lfkComplexes.length === 0 ? (
          <p className="empty-state">Нет комплексов ЛФК.</p>
        ) : (
          <>
            <p>Комплексы: {lfkComplexes.map((c) => c.title).join(", ")}</p>
            {recentLfkSessions.length > 0 && (
              <p>Последние занятия: {recentLfkSessions.length} записей</p>
            )}
          </>
        )}
      </section>

      <p>
        <Link href="/app/doctor/clients" className="button button--back">
          К списку клиентов
        </Link>
      </p>
    </AppShell>
  );
}
