/**
 * Карточка клиента: контакты, записи, дневники, коммуникации.
 * `/app/doctor/clients/[userId]` и при необходимости переиспользование.
 */
import Link from "next/link";
import type { ClientProfile } from "@/modules/doctor-clients/service";
import type { MessageLogEntry } from "@/modules/doctor-messaging/ports";
import type { PrepareDraftResult } from "@/modules/doctor-messaging/service";
import { phoneToTelHref } from "@/shared/lib/phoneLinks";
import { AssignLfkTemplatePanel } from "./AssignLfkTemplatePanel";
import { AdminDangerActions } from "./AdminDangerActions";
import { DoctorNotesPanel } from "./DoctorNotesPanel";
import { SendMessageForm } from "./[userId]/SendMessageForm";
import { SubscriberBlockPanel } from "./SubscriberBlockPanel";

type ClientProfileCardProps = {
  profile: ClientProfile;
  messageDraft: PrepareDraftResult | null;
  messageHistory: MessageLogEntry[];
  userId: string;
  /** База списка для ссылки «назад» (подписчики или клиенты). */
  listBasePath?: string;
  isAdmin?: boolean;
  publishedLfkTemplates?: { id: string; title: string }[];
  assignLfkEnabled?: boolean;
};

export function ClientProfileCard({
  profile,
  messageDraft,
  messageHistory,
  userId,
  listBasePath = "/app/doctor/clients",
  isAdmin = false,
  publishedLfkTemplates = [],
  assignLfkEnabled = false,
}: ClientProfileCardProps) {
  const {
    identity,
    channelCards,
    upcomingAppointments,
    appointmentHistory,
    appointmentStats,
    symptomTrackings,
    recentSymptomEntries,
    lfkComplexes,
    recentLfkSessions,
  } = profile;

  const tel = phoneToTelHref(identity.phone);
  const sampleRecordId = appointmentHistory[0]?.id ?? null;
  const backLabel = listBasePath.includes("subscribers") ? "К списку подписчиков" : "К списку клиентов";

  return (
    <>
      {identity.isBlocked ? (
        <div
          id="doctor-client-blocked-banner"
          className="mb-4 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm"
          role="status"
        >
          Подписчик заблокирован для отправки сообщений в чат поддержки
          {identity.blockedReason ? `: ${identity.blockedReason}` : "."}
        </div>
      ) : null}

      <section id="doctor-client-contacts-section" className="panel stack">
        <h2>Контакты</h2>
        {identity.phone ? (
          tel ? (
            <p>
              Телефон:{" "}
              <a href={tel} className="font-medium text-primary underline">
                {identity.phone}
              </a>
            </p>
          ) : (
            <p>Телефон: {identity.phone}</p>
          )
        ) : (
          <p>Телефон не указан</p>
        )}
        <p className="eyebrow">Каналы</p>
        <ul id="doctor-client-channels-list" className="list list-none p-0 m-0">
          {channelCards.map((ch) => (
            <li key={ch.code} id={`doctor-client-channel-item-${ch.code}`}>
              {ch.isLinked && ch.openUrl ? (
                <a href={ch.openUrl} target="_blank" rel="noopener noreferrer" className="text-primary underline">
                  {ch.title}
                </a>
              ) : (
                <>
                  {ch.title}: {ch.isLinked ? "подключён" : "не подключён"}
                  {ch.isLinked && (ch.isEnabledForMessages ? ", сообщения вкл." : ", сообщения выкл.")}
                </>
              )}
            </li>
          ))}
        </ul>
        <p className="eyebrow">Чат поддержки (веб-приложение)</p>
        <p>
          <Link
            href="/app/doctor/messages"
            className="text-primary underline"
            id="doctor-client-open-support-chat-link"
          >
            Открыть раздел сообщений
          </Link>
        </p>
        <p className="eyebrow">Карта пациента</p>
        <p className="text-muted-foreground text-sm">
          Раздел «Карта» будет в этапе 17.{" "}
          <span className="opacity-70">(заглушка, без вызова API)</span>
        </p>
      </section>

      <section id="doctor-client-appointments-section" className="panel stack">
        <h2>Ближайшие записи</h2>
        {upcomingAppointments.length === 0 ? (
          <p className="empty-state">Нет предстоящих записей.</p>
        ) : (
          <ul id="doctor-client-upcoming-appointments-list" className="list">
            {upcomingAppointments.map((a) => (
              <li key={a.id} id={`doctor-client-upcoming-appointment-${a.id}`} className="list-item">
                {a.link && /^https?:\/\//i.test(a.link) ? (
                  <a href={a.link} target="_blank" rel="noopener noreferrer">
                    {a.label}
                  </a>
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

      <section id="doctor-client-appointment-history-section" className="panel stack">
        <h2>История записей</h2>
        {appointmentHistory.length === 0 ? (
          <p className="empty-state">Нет записей в projection.</p>
        ) : (
          <ul id="doctor-client-appointment-history-list" className="list">
            {appointmentHistory.map((row) => (
              <li key={row.id} className="list-item">
                {row.label}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section id="doctor-client-symptoms-section" className="panel stack">
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

      <section id="doctor-client-lfk-section" className="panel stack">
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
        <AssignLfkTemplatePanel
          patientUserId={userId}
          templates={publishedLfkTemplates}
          disabled={!assignLfkEnabled}
        />
      </section>

      <DoctorNotesPanel userId={userId} />
      <SubscriberBlockPanel
        userId={userId}
        initiallyBlocked={identity.isBlocked}
        blockedReason={identity.blockedReason}
      />

      <section id="doctor-client-communications-section" className="panel stack">
        <h2>Коммуникации</h2>
        {messageDraft ? (
          <SendMessageForm
            userId={userId}
            availableChannels={messageDraft.availableChannels}
            channelBindings={messageDraft.channelBindings}
          />
        ) : (
          <p className="empty-state">Невозможно отправить сообщение (клиент не найден).</p>
        )}
        <h3 className="mt-4 mb-2">История сообщений</h3>
        {messageHistory.length === 0 ? (
          <p className="empty-state">Сообщений пока нет.</p>
        ) : (
          <ul id="doctor-client-message-history-list" className="list">
            {messageHistory.map((entry) => (
              <li key={entry.id} id={`doctor-client-message-history-item-${entry.id}`} className="list-item">
                <span className="eyebrow">
                  {new Date(entry.sentAt).toLocaleString("ru")} · {entry.category}
                  {entry.outcome === "sent" ? (
                    <span className="ml-1.5 text-green-600 dark:text-green-500">доставлено</span>
                  ) : entry.outcome === "failed" ? (
                    <span className="ml-1.5 text-destructive">ошибка</span>
                  ) : (
                    <span className="ml-1.5">{entry.outcome}</span>
                  )}
                </span>
                <p className="mt-1">
                  {entry.text.slice(0, 80)}
                  {entry.text.length > 80 ? "…" : ""}
                </p>
                {Object.keys(entry.channelBindingsUsed).length > 0 ? (
                  <span className="eyebrow text-xs opacity-80">
                    Каналы: {Object.keys(entry.channelBindingsUsed).join(", ")}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {isAdmin ? (
        <AdminDangerActions userId={userId} sampleIntegratorRecordId={sampleRecordId} />
      ) : null}

      <p id="doctor-client-back-link-container">
        <Link id="doctor-client-back-link" href={listBasePath} className="button button--back">
          {backLabel}
        </Link>
      </p>
    </>
  );
}
