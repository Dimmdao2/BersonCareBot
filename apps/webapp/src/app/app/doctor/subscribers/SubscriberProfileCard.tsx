/**
 * Компактная карточка подписчика: контакты, уведомления, счётчики по журналу сообщений.
 */
import Link from "next/link";
import type { ClientProfile } from "@/modules/doctor-clients/service";
import { cn } from "@/lib/utils";
import type { MessageLogEntry } from "@/modules/doctor-messaging/ports";
import { phoneToTelHref } from "@/shared/lib/phoneLinks";
import { AdminDangerActions } from "../clients/AdminDangerActions";
import { DoctorNotesPanel } from "../clients/DoctorNotesPanel";
import { ClientBookingHistoryPanel } from "../clients/ClientBookingHistoryPanel";
import { SubscriberBlockPanel } from "../clients/SubscriberBlockPanel";
import {
  doctorClientBackLinkClass,
  doctorClientOverviewPrimaryCardClass,
  doctorClientSectionTitleClass,
} from "../clients/doctorClientCardChrome";
import { doctorInlineLinkClass } from "@/shared/ui/doctorVisual";

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
      <section className={doctorClientOverviewPrimaryCardClass} id="doctor-subscriber-compact-contacts">
        <h2 className={doctorClientSectionTitleClass}>Контакты</h2>
        {identity.phone ? (
          tel ? (
            <p>
              Телефон:{" "}
              <a href={tel} className={doctorInlineLinkClass}>
                {identity.phone}
              </a>
            </p>
          ) : (
            <p>Телефон: {identity.phone}</p>
          )
        ) : (
          <p className="text-muted-foreground">Телефон не указан</p>
        )}
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Каналы</p>
        <ul className="m-0 flex flex-wrap list-none gap-2 p-0">
          {channelCards.map((ch) => (
            <li key={ch.code}>
              {ch.isLinked && ch.openUrl ? (
                <a
                  href={ch.openUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={doctorInlineLinkClass}
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

      <section className={doctorClientOverviewPrimaryCardClass} id="doctor-subscriber-notifications-summary">
        <h2 className={doctorClientSectionTitleClass}>Уведомления</h2>
        <ul className="list-none p-0 text-sm">
          {channelCards.map((ch) => (
            <li key={`n-${ch.code}`}>
              {ch.title}: уведомления {ch.isEnabledForNotifications ? "вкл." : "выкл."}
            </li>
          ))}
        </ul>
      </section>

      <section className={doctorClientOverviewPrimaryCardClass} id="doctor-subscriber-channel-msg-counts">
        <h2 className={doctorClientSectionTitleClass}>Сообщения специалиста (журнал)</h2>
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

      <section className={doctorClientOverviewPrimaryCardClass}>
        <h2 className={doctorClientSectionTitleClass}>Чат поддержки</h2>
        <Link href="/app/doctor/messages" className={doctorInlineLinkClass} id="doctor-open-support-chat-link">
          Открыть раздел сообщений
        </Link>
      </section>

      <DoctorNotesPanel userId={userId} />
      <ClientBookingHistoryPanel userId={userId} />
      <SubscriberBlockPanel
        userId={userId}
        initiallyBlocked={identity.isBlocked}
        blockedReason={identity.blockedReason}
      />
      {isAdmin ? (
        <AdminDangerActions userId={userId} sampleIntegratorRecordId={sampleRecordId} />
      ) : null}

      <p>
        <Link href={listBasePath} className={cn(doctorClientBackLinkClass, "shrink-0")}>
          К списку подписчиков
        </Link>
      </p>
    </>
  );
}
