"use client";

import { Button } from "@/components/ui/button";
import type { MessageLogEntry } from "@/modules/doctor-messaging/ports";
import { doctorClientStackedCardClass, doctorClientTabSectionClass } from "./doctorClientCardChrome";

type Props = {
  messageHistory: MessageLogEntry[];
  chatUnreadCount: number;
  onOpenChat: () => void;
};

export function DoctorClientCommunicationsTab({
  messageHistory,
  chatUnreadCount,
  onOpenChat,
}: Props) {
  return (
    <section id="doctor-client-section-communications" className={doctorClientTabSectionClass}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" size="sm" onClick={onOpenChat}>
            Открыть чат
            {chatUnreadCount > 0 ? (
              <span className="ml-1.5 rounded-full bg-primary-foreground px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-primary">
                {chatUnreadCount}
              </span>
            ) : null}
          </Button>
        </div>

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
        ) : (
          <p className="text-sm text-muted-foreground">Журнал отправок пуст</p>
        )}
      </div>
    </section>
  );
}
