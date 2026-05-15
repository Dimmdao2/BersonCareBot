"use client";

import type { BroadcastRecipientsPreview } from "@/modules/doctor-broadcasts/ports";

type Props = {
  recipientsPreview: BroadcastRecipientsPreview | undefined;
};

export function BroadcastRecipientsPreviewBlock({ recipientsPreview }: Props) {
  if (!recipientsPreview) return null;

  if (recipientsPreview.total === 0) {
    return (
      <p id="broadcast-recipients-preview-empty" className="text-xs text-muted-foreground">
        В расчёте доставки нет получателей с подходящим каналом.
      </p>
    );
  }

  return (
    <div id="broadcast-recipients-preview" className="flex flex-col gap-1 text-sm">
      <p className="text-muted-foreground">Получатели ({recipientsPreview.total})</p>
      <ul className="max-h-40 list-disc overflow-y-auto pl-5 text-xs" id="broadcast-recipients-preview-list">
        {recipientsPreview.names.map((name, i) => (
          <li key={`${i}:${name}`}>{name}</li>
        ))}
      </ul>
      {recipientsPreview.truncated ? (
        <p id="broadcast-recipients-preview-truncated" className="text-xs text-muted-foreground">
          Показано {recipientsPreview.names.length} из {recipientsPreview.total}.
        </p>
      ) : null}
    </div>
  );
}
