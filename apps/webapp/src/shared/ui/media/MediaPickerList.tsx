"use client";

import { memo } from "react";
import { File, Image as ImageIcon, ImageOff, Music, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { MediaPreviewStatus } from "@/modules/media/types";

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
};

type ItemProps = {
  item: MediaListItem;
  onSelect: (item: MediaListItem) => void;
};

function ThumbPlaceholder() {
  return <div className="h-24 w-full animate-pulse bg-muted/40" aria-hidden />;
}

const MediaPickerListItem = memo(function MediaPickerListItem({ item, onSelect }: ItemProps) {
  const title = item.displayName?.trim() || item.filename;
  const showOriginalFilename = Boolean(item.displayName?.trim()) && item.displayName!.trim() !== item.filename;
  const date = (() => {
    try {
      return new Date(item.createdAt).toLocaleString("ru-RU");
    } catch {
      return item.createdAt;
    }
  })();

  const previewStatus = item.previewStatus ?? "pending";
  const visual = item.kind === "image" || item.kind === "video";
  const thumbReady = visual && previewStatus === "ready" && Boolean(item.previewSmUrl?.trim());
  const thumbPending =
    visual && (previewStatus === "pending" || (previewStatus === "ready" && !item.previewSmUrl?.trim()));
  const thumbFailed = visual && previewStatus === "failed";
  const thumbSkipped = visual && previewStatus === "skipped";
  const thumbNoPreview = thumbFailed || thumbSkipped;

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border p-3">
      <div className="min-h-20 overflow-hidden rounded border border-border/60 bg-muted/30">
        {item.kind === "image" ? (
          thumbReady ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.previewSmUrl!} alt="" className="h-24 w-full object-contain bg-muted/30" />
          ) : thumbPending ? (
            <ThumbPlaceholder />
          ) : thumbNoPreview ? (
            <div className="flex h-24 w-full flex-col items-center justify-center gap-1 text-muted-foreground">
              <ImageOff className="h-7 w-7 opacity-60" aria-hidden />
              <span className="text-[10px]">{thumbSkipped ? "Без превью" : "Нет превью"}</span>
            </div>
          ) : (
            <div className="flex h-24 items-center justify-center bg-muted/30" aria-hidden>
              <ImageIcon className="h-8 w-8 text-muted-foreground" />
            </div>
          )
        ) : item.kind === "video" ? (
          thumbReady ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.previewSmUrl!} alt="" className="h-24 w-full object-contain bg-muted/30" />
          ) : thumbPending ? (
            <ThumbPlaceholder />
          ) : thumbNoPreview ? (
            <div className="flex h-24 w-full flex-col items-center justify-center gap-1 text-muted-foreground">
              <ImageOff className="h-7 w-7 opacity-60" aria-hidden />
              <span className="text-[10px]">{thumbSkipped ? "Без превью" : "Нет превью"}</span>
            </div>
          ) : (
            <div className="flex h-24 items-center justify-center bg-muted/30" aria-hidden>
              <Video className="h-8 w-8 text-muted-foreground" />
            </div>
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

export const MediaPickerList = memo(function MediaPickerList({ items, loading, error, onSelect }: Props) {
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
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {items.map((item) => (
        <MediaPickerListItem key={item.id} item={item} onSelect={onSelect} />
      ))}
    </div>
  );
});
