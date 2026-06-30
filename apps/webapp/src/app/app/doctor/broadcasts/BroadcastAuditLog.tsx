"use client";

import { useState } from "react";
import type { BroadcastAuditEntry } from "@/modules/doctor-broadcasts/ports";
import {
  formatAudienceLabel,
  formatBroadcastDate,
  formatCategoryLabel,
  formatChannelsSummary,
} from "./labels";

type Props = {
  entries: BroadcastAuditEntry[];
  /** Колбэк перехода в архив ошибок доставки (тот же, что верхняя ссылка «Архив ошибок доставки» в BroadcastsTab). */
  onArchive?: () => void;
  /** Колбэк «Создать на основе»: передаёт запись журнала для префилла формы. */
  onCreateFrom?: (entry: BroadcastAuditEntry) => void;
};

function deliveryProgressLine(entry: BroadcastAuditEntry): string {
  const planned = entry.deliveryJobsTotal > 0 ? entry.deliveryJobsTotal : entry.audienceSize;
  if (planned <= 0) return `${entry.sentCount} доставлено`;
  return `${entry.sentCount} из ${planned} доставлено`;
}

function deliveryIncomplete(entry: BroadcastAuditEntry): boolean {
  const planned = entry.deliveryJobsTotal > 0 ? entry.deliveryJobsTotal : entry.audienceSize;
  if (planned <= 0) return false;
  return entry.sentCount + entry.errorCount + entry.blockedRecipientCount < planned;
}

export function BroadcastAuditLog({ entries, onArchive, onCreateFrom }: Props) {
  const [openId, setOpenId] = useState<string | null>(null);

  if (entries.length === 0) {
    return (
      <p id="broadcast-audit-empty" className="text-sm text-muted-foreground">
        Рассылок ещё не было.
      </p>
    );
  }

  return (
    <div className="divide-y divide-border">
      {entries.map((entry) => {
        const isOpen = openId === entry.id;
        return (
          <div key={entry.id} className="group">
            {/* Шапка строки: кликабельная сводка */}
            <button
              type="button"
              aria-expanded={isOpen}
              onClick={() => setOpenId(isOpen ? null : entry.id)}
              className="flex w-full cursor-pointer select-none flex-wrap items-baseline gap-x-3 gap-y-0.5 px-1 py-2.5 text-left"
            >
              <span className="whitespace-nowrap text-xs text-muted-foreground">
                {formatBroadcastDate(entry.executedAt)}
              </span>
              <span className="text-xs font-medium">{formatCategoryLabel(entry.category)}</span>
              <span className="text-sm">{entry.messageTitle}</span>
              {/* Сводка: Аудитория · Каналы */}
              <span className="text-xs text-muted-foreground">
                {formatAudienceLabel(entry.audienceFilter)}
                {" · "}
                {formatChannelsSummary(entry.channels)}
              </span>
              <span className="ml-auto whitespace-nowrap text-xs text-muted-foreground">
                {deliveryProgressLine(entry)}
              </span>
            </button>

            {/* Раскрытый блок */}
            {isOpen && (
              <div
                id={`broadcast-audit-details-${entry.id}`}
                className="space-y-1.5 pb-3 pl-2 pr-1 text-xs text-muted-foreground"
              >
                <p>
                  <span className="font-medium text-foreground">Аудитория: </span>
                  {formatAudienceLabel(entry.audienceFilter)}
                </p>
                <p>
                  <span className="font-medium text-foreground">Каналы: </span>
                  {formatChannelsSummary(entry.channels)}
                </p>
                {entry.messageBody.trim().length > 0 && (
                  <p>
                    <span className="font-medium text-foreground">Текст: </span>
                    {entry.messageBody.replace(/\s+/g, " ").trim()}
                  </p>
                )}
                {entry.attachMenuAfterSend ? <p>Меню в чате обновлялось.</p> : null}
                {entry.blockedRecipientCount > 0 ? (
                  <p>Бот заблокирован: {entry.blockedRecipientCount}</p>
                ) : null}
                {entry.errorCount > 0 ? (
                  <p className="text-destructive">Не удалось доставить: {entry.errorCount}</p>
                ) : null}
                {deliveryIncomplete(entry) ? (
                  <p className="text-amber-800 dark:text-amber-400">
                    Часть сообщений ещё в очереди — обновите страницу через минуту.
                  </p>
                ) : null}
                {entry.deliveryJobsTotal === 0 ? (
                  <p>Запись без постановки в очередь: итог по списку получателей.</p>
                ) : null}
                <p className="flex flex-wrap gap-x-3 gap-y-1">
                  {onArchive && (
                    <button
                      type="button"
                      onClick={onArchive}
                      className="text-xs underline hover:no-underline"
                    >
                      Открыть ошибки →
                    </button>
                  )}
                  {onCreateFrom && (
                    <button
                      type="button"
                      onClick={() => onCreateFrom(entry)}
                      className="text-xs underline hover:no-underline"
                    >
                      Создать на основе
                    </button>
                  )}
                </p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
