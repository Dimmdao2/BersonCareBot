"use client";

import { memo, useState } from "react";
import { Check, File, Music } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { MediaExerciseUsageEntry, MediaPreviewStatus } from "@/modules/media/types";
import { MediaThumb } from "@/shared/ui/media/MediaThumb";
import { libraryMediaRowToPreviewUi } from "@/shared/ui/media/mediaPreviewUiModel";
import { MediaPickerQuickPreviewDialog } from "@/shared/ui/media/MediaPickerQuickPreviewDialog";

export type MediaListItem = {
  id: string;
  kind: "image" | "video" | "audio" | "file";
  filename: string;
  /** Как в экране библиотеки: подпись в CMS; если пусто — показываем filename. */
  displayName?: string | null;
  mimeType: string;
  size: number;
  createdAt: string;
  url: string;
  previewSmUrl?: string | null;
  previewMdUrl?: string | null;
  previewStatus?: MediaPreviewStatus;
};

type Props = {
  items: MediaListItem[];
  loading: boolean;
  error: string | null;
  onSelect: (item: MediaListItem) => void;
  /** When set, cards may show LFK exercise attachment indicator + tooltip. */
  exerciseUsageByMediaId?: Record<string, MediaExerciseUsageEntry[]>;
  /** Exercise-form picker: click thumbnail opens quick preview; «Выбрать» stays the explicit select action. */
  enableQuickPreview?: boolean;
};

type ItemProps = {
  item: MediaListItem;
  onSelect: (item: MediaListItem) => void;
  exerciseUsage?: MediaExerciseUsageEntry[];
  enableQuickPreview?: boolean;
  onQuickPreview: (item: MediaListItem) => void;
};

function exerciseUsageTooltipLines(usage: MediaExerciseUsageEntry[]): string {
  const max = 25;
  const slice = usage.slice(0, max);
  const lines = slice.map((u) => u.title.trim()).filter(Boolean);
  if (usage.length > max) lines.push(`… и ещё ${usage.length - max}`);
  return lines.join("\n");
}

const MediaPickerListItem = memo(function MediaPickerListItem({
  item,
  onSelect,
  exerciseUsage,
  enableQuickPreview,
  onQuickPreview,
}: ItemProps) {
  const title = item.displayName?.trim() || item.filename;
  const showOriginalFilename = Boolean(item.displayName?.trim()) && item.displayName!.trim() !== item.filename;
  const date = (() => {
    try {
      return new Date(item.createdAt).toLocaleString("ru-RU");
    } catch {
      return item.createdAt;
    }
  })();

  const hasExerciseUsage = Boolean(exerciseUsage?.length);
  const usageTooltip = hasExerciseUsage ? exerciseUsageTooltipLines(exerciseUsage!) : "";

  return (
    <div className="relative flex flex-col gap-2 rounded-md border border-border p-3">
      {hasExerciseUsage ? (
        <Tooltip>
          <TooltipTrigger
            type="button"
            className="absolute top-2 right-2 z-10 flex size-5 cursor-default items-center justify-center rounded-full border border-green-600/30 bg-background shadow-sm"
            aria-label={`Уже в упражнениях: ${usageTooltip.replaceAll("\n", ", ")}`}
          >
            <Check className="size-3 text-green-600" aria-hidden strokeWidth={3} />
          </TooltipTrigger>
          <TooltipContent side="left" align="end" className="max-w-xs whitespace-pre-line text-left">
            {usageTooltip}
          </TooltipContent>
        </Tooltip>
      ) : null}
      <div className="relative min-h-20 overflow-hidden rounded border border-border/60 bg-muted/30">
        {item.kind === "image" || item.kind === "video" ? (
          enableQuickPreview ? (
            <button
              type="button"
              className="block h-24 w-full cursor-zoom-in p-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={`Предпросмотр: ${title}`}
              onClick={() => onQuickPreview(item)}
            >
              <MediaThumb
                media={libraryMediaRowToPreviewUi(item)}
                className="h-24 w-full"
                imgClassName="h-24 w-full object-contain bg-muted/30"
                labels={{ skipped: "Без превью", failed: "Нет превью" }}
              />
            </button>
          ) : (
            <MediaThumb
              media={libraryMediaRowToPreviewUi(item)}
              className="h-24 w-full"
              imgClassName="h-24 w-full object-contain bg-muted/30"
              labels={{ skipped: "Без превью", failed: "Нет превью" }}
            />
          )
        ) : item.kind === "audio" ? (
          <div className="flex h-24 items-center justify-center bg-muted/30" aria-hidden>
            <Music className="h-8 w-8 text-muted-foreground" />
          </div>
        ) : (
          <div className="flex h-24 items-center justify-center bg-muted/30" aria-hidden>
            <File className="h-8 w-8 text-muted-foreground" />
          </div>
        )}
      </div>
      <p className="min-h-10 break-words line-clamp-2 text-sm font-medium" title={title}>
        {title}
      </p>
      {showOriginalFilename ? (
        <p className="line-clamp-1 break-all text-xs text-muted-foreground" title={item.filename}>
          Исходное имя: {item.filename}
        </p>
      ) : null}
      <p className="text-xs text-muted-foreground">
        {item.kind} • {date}
      </p>
      <Button type="button" size="sm" onClick={() => onSelect(item)}>
        Выбрать
      </Button>
    </div>
  );
});

export const MediaPickerList = memo(function MediaPickerList({
  items,
  loading,
  error,
  onSelect,
  exerciseUsageByMediaId,
  enableQuickPreview = false,
}: Props) {
  const [quickPreviewItem, setQuickPreviewItem] = useState<MediaListItem | null>(null);

  if (error) {
    return <p className="text-sm text-destructive">{error}</p>;
  }
  if (loading) {
    return <p className="text-sm text-muted-foreground">Загрузка...</p>;
  }
  if (items.length === 0) {
    return <p className="rounded-md border border-border p-3 text-sm text-muted-foreground">Нет файлов</p>;
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <MediaPickerListItem
            key={item.id}
            item={item}
            onSelect={onSelect}
            exerciseUsage={exerciseUsageByMediaId?.[item.id.toLowerCase()]}
            enableQuickPreview={enableQuickPreview}
            onQuickPreview={setQuickPreviewItem}
          />
        ))}
      </div>
      <MediaPickerQuickPreviewDialog
        item={quickPreviewItem}
        open={quickPreviewItem !== null}
        onOpenChange={(o) => {
          if (!o) setQuickPreviewItem(null);
        }}
      />
    </>
  );
});
