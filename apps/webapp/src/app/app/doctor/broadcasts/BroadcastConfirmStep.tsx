"use client";

import type { BroadcastCommand, BroadcastPreviewResult } from "@/modules/doctor-broadcasts/ports";
import {
  formatAudienceLabel,
  formatCategoryLabel,
  formatChannelsSummary,
  isAudienceEstimateApproximate,
} from "./labels";

type Props = {
  preview: BroadcastPreviewResult;
  command: Omit<BroadcastCommand, "actorId">;
  onConfirm: () => void;
  onCancel: () => void;
  isLoading: boolean;
};

export function BroadcastConfirmStep({ preview, command, onConfirm, onCancel, isLoading }: Props) {
  return (
    <div
      id="broadcast-confirm-step"
      className="rounded-xl border border-border bg-card p-4 flex flex-col gap-4"
    >
      <h3 className="text-sm font-semibold">Подтверждение рассылки</h3>

      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
        <dt className="text-muted-foreground">Категория</dt>
        <dd>{formatCategoryLabel(command.category)}</dd>
        <dt className="text-muted-foreground">Аудитория</dt>
        <dd>{formatAudienceLabel(command.audienceFilter)}</dd>
        <dt className="text-muted-foreground">Заголовок</dt>
        <dd className="font-medium">{command.message.title}</dd>
        <dt className="text-muted-foreground">Получателей</dt>
        <dd id="broadcast-audience-size" className="font-semibold">{preview.audienceSize}</dd>
        <dt className="text-muted-foreground">Каналы</dt>
        <dd id="broadcast-channels-summary">{formatChannelsSummary(preview.channels)}</dd>
      </dl>

      {isAudienceEstimateApproximate(command.audienceFilter) ? (
        <p
          id="broadcast-preview-estimate-warning"
          className="text-xs text-amber-700 dark:text-amber-500"
        >
          Число получателей — грубая оценка (все клиенты); точный сегмент будет доступен позже.
        </p>
      ) : null}

      <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
        После подтверждения рассылка будет запущена и её нельзя отменить.
      </p>

      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={onCancel}
          disabled={isLoading}
          className="rounded-md border border-border px-4 py-2 text-sm disabled:opacity-50"
        >
          Назад
        </button>
        <button
          type="button"
          id="broadcast-confirm-button"
          onClick={onConfirm}
          disabled={isLoading}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {isLoading ? "Отправка…" : `Отправить ${preview.audienceSize} получателям`}
        </button>
      </div>
    </div>
  );
}
