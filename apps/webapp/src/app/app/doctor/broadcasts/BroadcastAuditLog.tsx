"use client";

import { useState } from "react";
import type { BroadcastAuditEntry } from "@/modules/doctor-broadcasts/ports";
import { Button } from "@/shared/ui/doctor/primitives/button";
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
          <div key={entry.id} className="group min-w-0">
            {/* Шапка строки: кликабельная сводка */}
            <Button
              type="button"
              variant="ghost"
              aria-expanded={isOpen}
              onClick={() => setOpenId(isOpen ? null : entry.id)}
              className="block h-auto min-h-0 w-full cursor-pointer select-none whitespace-normal px-2 py-2.5 text-left"
            >
              <span className="flex min-w-0 items-start gap-2">
                <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">
                  {formatBroadcastDate(entry.executedAt)}
                </span>
                <span className="min-w-0 text-xs font-medium">
                  {formatCategoryLabel(entry.category)}
                </span>
                <span className="ml-auto shrink-0 whitespace-nowrap text-xs text-muted-foreground">
                  {deliveryProgressLine(entry)}
                </span>
              </span>
              <span className="mt-1 block break-words text-sm font-medium leading-5">
                {entry.messageTitle}
              </span>
              <span className="mt-0.5 block break-words text-xs text-muted-foreground">
                {formatAudienceLabel(entry.audienceFilter)}
                {" · "}
                {formatChannelsSummary(entry.channels)}
              </span>
            </Button>

            {/* Раскрытый блок */}
            {isOpen && (
              <div
                id={`broadcast-audit-details-${entry.id}`}
                className="min-w-0 space-y-1.5 px-2 pb-3 text-xs text-muted-foreground"
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
                  <p className="break-words whitespace-pre-wrap">
                    <span className="font-medium text-foreground">Текст: </span>
                    {entry.messageBody.trim()}
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
                    <Button
                      type="button"
                      variant="link"
                      size="sm"
                      onClick={onArchive}
                    >
                      Открыть ошибки →
                    </Button>
                  )}
                  {onCreateFrom && (
                    <Button
                      type="button"
                      variant="link"
                      size="sm"
                      onClick={() => onCreateFrom(entry)}
                    >
                      Создать на основе
                    </Button>
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
