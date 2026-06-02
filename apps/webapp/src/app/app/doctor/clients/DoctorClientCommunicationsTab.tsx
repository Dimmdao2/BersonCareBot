"use client";

import type { MessageLogEntry } from "@/modules/doctor-messaging/ports";
import { DoctorClientEmbeddedChat } from "./DoctorClientEmbeddedChat";
import {
  doctorClientSectionTitleClass,
  doctorClientStackedCardClass,
  doctorClientTabSectionClass,
} from "./doctorClientCardChrome";

type Props = {
  patientUserId: string;
  messageHistory: MessageLogEntry[];
  onUnreadChange?: (count: number) => void;
};

export function DoctorClientCommunicationsTab({
  patientUserId,
  messageHistory,
  onUnreadChange,
}: Props) {
  return (
    <section id="doctor-client-section-communications" className={doctorClientTabSectionClass}>
      <div className="flex flex-col gap-4">
        <h3 className={doctorClientSectionTitleClass}>Чат поддержки</h3>
        <DoctorClientEmbeddedChat patientUserId={patientUserId} onUnreadChange={onUnreadChange} />

        {messageHistory.length > 0 ? (
          <details className="group">
            <summary className="cursor-pointer list-none text-sm font-medium [&::-webkit-details-marker]:hidden">
              Старый журнал отправок ({messageHistory.length})
            </summary>
            <ul id="doctor-client-message-history-list" className="m-0 mt-3 list-none space-y-2 p-0">
              {messageHistory.map((entry) => (
                <li
                  key={entry.id}
                  id={`doctor-client-message-history-item-${entry.id}`}
                  className={doctorClientStackedCardClass}
                >
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {new Date(entry.sentAt).toLocaleString("ru")} · {entry.category}
                  </span>
                  <p className="mt-1 text-sm leading-snug">
                    {entry.text.slice(0, 80)}
                    {entry.text.length > 80 ? "…" : ""}
                  </p>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </div>
    </section>
  );
}
