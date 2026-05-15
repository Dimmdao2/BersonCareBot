"use client";

import type { BroadcastPreviewResult } from "@/modules/doctor-broadcasts/ports";
import { formatChannelsSummary, isAudienceEstimateApproximate } from "./labels";
import { BroadcastRecipientsPreviewBlock } from "./BroadcastRecipientsPreview";

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
        Получателей (доставка): {preview.audienceSize}
        {preview.segmentSize != null && preview.segmentSize > preview.audienceSize
          ? ` (в сегменте ${preview.segmentSize})`
          : ""}
      </p>
      {!isAudienceEstimateApproximate(preview.audienceFilter) ? (
        <BroadcastRecipientsPreviewBlock recipientsPreview={preview.recipientsPreview} />
      ) : null}

      <p className="text-xs text-muted-foreground">Каналы: {formatChannelsSummary(preview.channels)}</p>
    </div>
  );
}
