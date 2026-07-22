"use client";

import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BroadcastAuditEntry } from "@/modules/doctor-broadcasts/ports";
import { Button } from "@/shared/ui/doctor/primitives/button";
import {
  doctorSectionCardClass,
  doctorSectionTitleClass,
} from "@/shared/ui/doctor/doctorVisual";
import {
  formatAudienceLabel,
  formatBroadcastDate,
  formatCategoryLabel,
  formatChannelsSummary,
} from "./labels";

type LogProps = {
  entries: BroadcastAuditEntry[];
  selectedId?: string | null;
  onSelect: (entry: BroadcastAuditEntry) => void;
};

type DetailProps = {
  entry: BroadcastAuditEntry;
  onClose: () => void;
  onOpenErrors: () => void;
  onCreateFrom?: (entry: BroadcastAuditEntry) => void;
};

function plannedDeliveryCount(entry: BroadcastAuditEntry): number {
  return entry.deliveryJobsTotal > 0 ? entry.deliveryJobsTotal : entry.audienceSize;
}

function deliveryProgressLine(entry: BroadcastAuditEntry): string {
  const planned = plannedDeliveryCount(entry);
  if (planned <= 0) return `${entry.sentCount} доставлено`;
  return `${entry.sentCount} из ${planned} доставлено`;
}

function nonDeliveryCount(entry: BroadcastAuditEntry): number {
  return Math.max(0, plannedDeliveryCount(entry) - entry.sentCount);
}

function pendingDeliveryCount(entry: BroadcastAuditEntry): number {
  return Math.max(
    0,
    plannedDeliveryCount(entry) -
      entry.sentCount -
      entry.errorCount -
      entry.blockedRecipientCount,
  );
}

export function BroadcastAuditLog({ entries, selectedId = null, onSelect }: LogProps) {
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
        const isSelected = selectedId === entry.id;
        return (
          <div key={entry.id} className="group min-w-0">
            <Button
              type="button"
              variant="ghost"
              aria-pressed={isSelected}
              onClick={() => onSelect(entry)}
              className={cn(
                "block h-auto min-h-0 w-full cursor-pointer select-none whitespace-normal rounded-none px-2 py-2.5 text-left",
                isSelected && "bg-primary/15 text-primary hover:bg-primary/20",
              )}
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
          </div>
        );
      })}
    </div>
  );
}

export function BroadcastAuditEntryDetail({
  entry,
  onClose,
  onOpenErrors,
  onCreateFrom,
}: DetailProps) {
  const pendingCount = pendingDeliveryCount(entry);

  return (
    <section
      className={cn(doctorSectionCardClass, "h-full min-h-0 overflow-y-auto")}
      data-testid="broadcast-selected-detail"
    >
      <div className="flex items-start justify-between gap-3 border-b border-border pb-3">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">
            {formatBroadcastDate(entry.executedAt)} · {formatCategoryLabel(entry.category)}
          </p>
          <h2 className={cn(doctorSectionTitleClass, "mt-1 break-words")}>{entry.messageTitle}</h2>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onClose}
          aria-label="Закрыть просмотр рассылки"
          className="shrink-0"
        >
          <X aria-hidden className="size-4" />
        </Button>
      </div>

      {entry.messageBody.trim().length > 0 ? (
        <p className="whitespace-pre-wrap break-words text-sm">{entry.messageBody.trim()}</p>
      ) : null}

      <dl className="grid grid-cols-2 gap-2 text-sm">
        <div className="min-w-0 rounded-[var(--doctor-kpi-radius,8px)] border border-border bg-muted/15 p-3">
          <dt className="text-xs text-muted-foreground">Кому</dt>
          <dd className="mt-1 break-words font-medium">
            {formatAudienceLabel(entry.audienceFilter)} · {entry.audienceSize}
          </dd>
        </div>
        <div className="min-w-0 rounded-[var(--doctor-kpi-radius,8px)] border border-border bg-muted/15 p-3">
          <dt className="text-xs text-muted-foreground">Куда</dt>
          <dd className="mt-1 break-words font-medium">{formatChannelsSummary(entry.channels)}</dd>
        </div>
        <div className="min-w-0 rounded-[var(--doctor-kpi-radius,8px)] border border-border bg-muted/15 p-3">
          <dt className="text-xs text-muted-foreground">Ошибки</dt>
          <dd className="mt-1 font-medium tabular-nums">{entry.errorCount}</dd>
        </div>
        <div className="min-w-0 rounded-[var(--doctor-kpi-radius,8px)] border border-border bg-muted/15 p-3">
          <dt className="text-xs text-muted-foreground">Недоставка</dt>
          <dd className="mt-1 font-medium tabular-nums">{nonDeliveryCount(entry)}</dd>
        </div>
      </dl>

      <div className="space-y-1 text-xs text-muted-foreground">
        <p>{deliveryProgressLine(entry)}</p>
        {entry.attachMenuAfterSend ? <p>Меню в чате обновлялось.</p> : null}
        {entry.blockedRecipientCount > 0 ? (
          <p>Бот заблокирован: {entry.blockedRecipientCount}</p>
        ) : null}
        {entry.errorCount > 0 ? (
          <p className="text-destructive">Не удалось доставить: {entry.errorCount}</p>
        ) : null}
        {pendingCount > 0 ? (
          <p className="text-amber-800 dark:text-amber-400">
            В очереди: {pendingCount}. Обновите страницу через минуту.
          </p>
        ) : null}
        {entry.deliveryJobsTotal === 0 ? (
          <p>Запись без постановки в очередь: итог по списку получателей.</p>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onOpenErrors}>
          Лог ошибок
        </Button>
        {onCreateFrom ? (
          <Button type="button" variant="outline" size="sm" onClick={() => onCreateFrom(entry)}>
            Создать на основе
          </Button>
        ) : null}
      </div>
    </section>
  );
}
