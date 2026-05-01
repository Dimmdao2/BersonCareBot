"use client";

import type { BroadcastPreviewResult } from "@/modules/doctor-broadcasts/ports";
import { formatChannelsSummary } from "./labels";

type Props = {
  preview: BroadcastPreviewResult;
};

/** Сообщение об успешной записи рассылки в аудит (после `executeBroadcastAction` + `revalidatePath`). */
export function BroadcastSentMessage({ preview }: Props) {
  return (
    <div
      id="broadcast-sent-message"
      className="rounded-xl border border-border bg-card p-4 flex flex-col gap-3"
    >
      <p className="font-medium text-sm">Рассылка запущена. Журнал обновится автоматически.</p>
      <p className="text-xs text-muted-foreground">
        Аудитория: {preview.audienceSize} получателей
      </p>
      <p className="text-xs text-muted-foreground">Каналы: {formatChannelsSummary(preview.channels)}</p>
    </div>
  );
}
