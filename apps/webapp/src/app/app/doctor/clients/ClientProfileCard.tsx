/**
 * Переиспользуемая карточка клиента: контакты, записи, дневники, коммуникации.
 * Используется на странице /app/doctor/clients/[userId] и в master-detail на /app/doctor/clients.
 */
import Link from "next/link";
import type { ClientProfile } from "@/modules/doctor-clients/service";
import type { MessageLogEntry } from "@/modules/doctor-messaging/ports";
import type { PrepareDraftResult } from "@/modules/doctor-messaging/service";
import { SendMessageForm } from "./[userId]/SendMessageForm";

type ClientProfileCardProps = {
  profile: ClientProfile;
  messageDraft: PrepareDraftResult | null;
  messageHistory: MessageLogEntry[];
  userId: string;
  senderId: string;
};

export function ClientProfileCard({
  profile,
  messageDraft,
  messageHistory,
  userId,
  senderId,
}: ClientProfileCardProps) {
  const {
    identity,
    channelCards,
    upcomingAppointments,
    appointmentStats,
    symptomTrackings,
    recentSymptomEntries,
    lfkComplexes,
    recentLfkSessions,
  } = profile;

  return (
    <>
      <section className="panel stack">
        <h2>Контакты</h2>
        <p>{identity.phone ? `Телефон: ${identity.phone}` : "Телефон не указан"}</p>
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
                {a.link && /^https?:\/\//i.test(a.link) ? (
                  <a href={a.link} target="_blank" rel="noopener noreferrer">{a.label}</a>
                ) : (
                  a.label
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="eyebrow">
          Статистика: всего {appointmentStats.total}, отмен за 30 дн.: {appointmentStats.cancellations30d}
        </p>
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

      <section className="panel stack">
        <h2>Коммуникации</h2>
        {messageDraft ? (
          <SendMessageForm
            userId={userId}
            senderId={senderId}
            availableChannels={messageDraft.availableChannels}
            channelBindings={messageDraft.channelBindings}
          />
        ) : (
          <p className="empty-state">Невозможно отправить сообщение (клиент не найден).</p>
        )}
        <h3 style={{ marginTop: 16, marginBottom: 8 }}>История сообщений</h3>
        {messageHistory.length === 0 ? (
          <p className="empty-state">Сообщений пока нет.</p>
        ) : (
          <ul className="list">
            {messageHistory.map((entry) => (
              <li key={entry.id} className="list-item">
                <span className="eyebrow">
                  {new Date(entry.sentAt).toLocaleString("ru")} · {entry.category}
                  {entry.outcome === "sent" ? (
                    <span style={{ color: "#1d6b42", marginLeft: 6 }}>доставлено</span>
                  ) : entry.outcome === "failed" ? (
                    <span style={{ color: "#9c4242", marginLeft: 6 }}>ошибка</span>
                  ) : (
                    <span style={{ marginLeft: 6 }}>{entry.outcome}</span>
                  )}
                </span>
                <p style={{ margin: "4px 0 0" }}>
                  {entry.text.slice(0, 80)}
                  {entry.text.length > 80 ? "…" : ""}
                </p>
                {Object.keys(entry.channelBindingsUsed).length > 0 ? (
                  <span className="eyebrow" style={{ fontSize: "0.75rem" }}>
                    Каналы: {Object.keys(entry.channelBindingsUsed).join(", ")}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <p>
        <Link href="/app/doctor/clients" className="button button--back">
          К списку клиентов
        </Link>
      </p>
    </>
  );
}
