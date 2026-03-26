/**
 * Компактная карточка подписчика: контакты, уведомления, счётчики по журналу сообщений.
 */
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button-variants";
import type { ClientProfile } from "@/modules/doctor-clients/service";
import { cn } from "@/lib/utils";
import type { MessageLogEntry } from "@/modules/doctor-messaging/ports";
import { phoneToTelHref } from "@/shared/lib/phoneLinks";
import { AdminDangerActions } from "../clients/AdminDangerActions";
import { DoctorNotesPanel } from "../clients/DoctorNotesPanel";
import { SubscriberBlockPanel } from "../clients/SubscriberBlockPanel";

type Props = {
  profile: ClientProfile;
  messageHistory: MessageLogEntry[];
  userId: string;
  listBasePath: string;
  isAdmin: boolean;
};

function aggregateChannelCounts(history: MessageLogEntry[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const entry of history) {
    const keys = Object.keys(entry.channelBindingsUsed ?? {});
    for (const k of keys) {
      out[k] = (out[k] ?? 0) + 1;
    }
  }
  return out;
}

export function SubscriberProfileCard({
  profile,
  messageHistory,
  userId,
  listBasePath,
  isAdmin,
}: Props) {
  const { identity, channelCards } = profile;
  const tel = phoneToTelHref(identity.phone);
  const counts = aggregateChannelCounts(messageHistory);
  const sampleRecordId = profile.appointmentHistory[0]?.id ?? null;

  return (
    <>
      <section className="panel stack" id="doctor-subscriber-compact-contacts">
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
          <p className="text-muted-foreground">Телефон не указан</p>
        )}
        <p className="eyebrow">Каналы</p>
        <ul className="list flex flex-wrap gap-2" style={{ listStyle: "none", padding: 0 }}>
          {channelCards.map((ch) => (
            <li key={ch.code}>
              {ch.isLinked && ch.openUrl ? (
                <a
                  href={ch.openUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline"
                >
                  {ch.title}
                </a>
              ) : (
                <span>
                  {ch.title}: {ch.isLinked ? "подключён" : "не подключён"}
                </span>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="panel stack" id="doctor-subscriber-notifications-summary">
        <h2>Уведомления</h2>
        <ul className="text-sm" style={{ listStyle: "none", padding: 0 }}>
          {channelCards.map((ch) => (
            <li key={`n-${ch.code}`}>
              {ch.title}: уведомления {ch.isEnabledForNotifications ? "вкл." : "выкл."}
            </li>
          ))}
        </ul>
      </section>

      <section className="panel stack" id="doctor-subscriber-channel-msg-counts">
        <h2>Сообщения специалиста (журнал)</h2>
        {Object.keys(counts).length === 0 ? (
          <p className="text-muted-foreground text-sm">Нет данных по каналам в последних сообщениях.</p>
        ) : (
          <ul className="text-sm" id="doctor-subscriber-channel-counts-list">
            {Object.entries(counts).map(([code, n]) => (
              <li key={code}>
                {code}: {n}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel stack">
        <h2>Чат поддержки</h2>
        <Link href="/app/doctor/messages" className="text-primary underline" id="doctor-open-support-chat-link">
          Открыть раздел сообщений
        </Link>
      </section>

      <DoctorNotesPanel userId={userId} />
      <SubscriberBlockPanel
        userId={userId}
        initiallyBlocked={identity.isBlocked}
        blockedReason={identity.blockedReason}
      />
      {isAdmin ? (
        <AdminDangerActions userId={userId} sampleIntegratorRecordId={sampleRecordId} />
      ) : null}

      <p>
        <Link
          href={listBasePath}
          className={cn(buttonVariants({ variant: "outline", size: "sm" }), "button--back shrink-0")}
        >
          К списку подписчиков
        </Link>
      </p>
    </>
  );
}
