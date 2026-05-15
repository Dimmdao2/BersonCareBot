"use client";

import { Fragment, useState } from "react";
import type { BroadcastAuditEntry } from "@/modules/doctor-broadcasts/ports";
import {
  formatAudienceLabel,
  formatBroadcastDate,
  formatCategoryLabel,
  formatChannelsSummary,
} from "./labels";

type Props = {
  entries: BroadcastAuditEntry[];
};

function bodyPreview(s: string, max = 140): string {
  const one = s.replace(/\s+/g, " ").trim();
  if (one.length <= max) return one;
  return `${one.slice(0, max - 1)}…`;
}

function deliveryPlannedLabel(entry: BroadcastAuditEntry): string {
  if (entry.deliveryJobsTotal > 0) return String(entry.deliveryJobsTotal);
  return "—";
}

function deliveryProgressLine(entry: BroadcastAuditEntry): string {
  const planned = entry.deliveryJobsTotal > 0 ? entry.deliveryJobsTotal : entry.audienceSize;
  if (planned <= 0) return `${entry.sentCount} доставлено`;
  return `${entry.sentCount} из ${planned} доставлено`;
}

function deliveryIncomplete(entry: BroadcastAuditEntry): boolean {
  const planned = entry.deliveryJobsTotal > 0 ? entry.deliveryJobsTotal : entry.audienceSize;
  if (planned <= 0) return false;
  return entry.sentCount + entry.errorCount < planned;
}

export function BroadcastAuditLog({ entries }: Props) {
  const [openId, setOpenId] = useState<string | null>(null);

  if (entries.length === 0) {
    return (
      <p id="broadcast-audit-empty" className="text-sm text-muted-foreground">
        Рассылок ещё не было.
      </p>
    );
  }

  const hasErrors = entries.some((e) => e.errorCount > 0);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted-foreground">
            <th className="pb-2 pr-2 font-medium w-8" aria-label="Детали" />
            <th className="pb-2 pr-4 font-medium">Дата</th>
            <th className="pb-2 pr-4 font-medium">Категория</th>
            <th className="pb-2 pr-4 font-medium">Аудитория</th>
            <th className="pb-2 pr-4 font-medium">Каналы</th>
            <th className="pb-2 pr-4 font-medium">Заголовок</th>
            <th className="pb-2 pr-4 font-medium text-right">Получателей в списке</th>
            <th className="pb-2 pr-4 font-medium text-right">Сообщений запланировано</th>
            <th className="pb-2 pr-4 font-medium text-right">Итог доставки</th>
            {hasErrors ? <th className="pb-2 font-medium text-right">Не удалось доставить</th> : null}
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => {
            const expanded = openId === entry.id;
            return (
              <Fragment key={entry.id}>
                <tr className="border-b border-border/50 last:border-0">
                  <td className="py-2 pr-2 align-top">
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-foreground text-xs"
                      aria-expanded={expanded}
                      aria-controls={`broadcast-audit-details-${entry.id}`}
                      onClick={() => setOpenId(expanded ? null : entry.id)}
                    >
                      {expanded ? "▼" : "▶"}
                    </button>
                  </td>
                  <td className="py-2 pr-4 whitespace-nowrap text-muted-foreground align-top">
                    {formatBroadcastDate(entry.executedAt)}
                  </td>
                  <td className="py-2 pr-4 align-top">{formatCategoryLabel(entry.category)}</td>
                  <td className="py-2 pr-4 whitespace-nowrap align-top">{formatAudienceLabel(entry.audienceFilter)}</td>
                  <td className="py-2 pr-4 whitespace-nowrap text-muted-foreground align-top">
                    {formatChannelsSummary(entry.channels)}
                  </td>
                  <td className="py-2 pr-4 align-top">{entry.messageTitle}</td>
                  <td className="py-2 pr-4 text-right tabular-nums align-top">{entry.audienceSize}</td>
                  <td className="py-2 pr-4 text-right tabular-nums align-top">{deliveryPlannedLabel(entry)}</td>
                  <td className="py-2 pr-4 text-right tabular-nums align-top text-xs leading-snug">
                    {deliveryProgressLine(entry)}
                  </td>
                  {hasErrors ? (
                    <td className="py-2 text-right tabular-nums text-destructive align-top">{entry.errorCount}</td>
                  ) : null}
                </tr>
                {expanded ? (
                  <tr key={`${entry.id}-details`} className="border-b border-border/50 last:border-0 bg-muted/30">
                    <td />
                    <td colSpan={hasErrors ? 9 : 8} className="py-3 pr-4 pl-0 text-xs text-muted-foreground">
                      <div id={`broadcast-audit-details-${entry.id}`} className="space-y-2 max-w-prose">
                        <p>
                          <span className="font-medium text-foreground">Текст (начало): </span>
                          {entry.messageBody.trim().length > 0 ? bodyPreview(entry.messageBody) : "—"}
                        </p>
                        {entry.attachMenuAfterSend ? <p className="text-foreground">Меню в чате обновлялось.</p> : null}
                        {deliveryIncomplete(entry) ? (
                          <p className="text-amber-800 dark:text-amber-400">
                            Часть сообщений ещё в очереди — обновите страницу через минуту.
                          </p>
                        ) : null}
                        {entry.deliveryJobsTotal === 0 ? (
                          <p>Запись без постановки в очередь: итог по списку получателей.</p>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
