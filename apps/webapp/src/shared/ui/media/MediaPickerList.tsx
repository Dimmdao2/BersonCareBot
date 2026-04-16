"use client";

import { Button } from "@/components/ui/button";
import { VideoThumbnailPreview } from "@/shared/ui/media/VideoThumbnailPreview";

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
};

type Props = {
  items: MediaListItem[];
  loading: boolean;
  error: string | null;
  onSelect: (item: MediaListItem) => void;
};

function shortDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("ru-RU");
  } catch {
    return iso;
  }
}

function pickerTitle(item: MediaListItem): string {
  return item.displayName?.trim() || item.filename;
}

export function MediaPickerList({ items, loading, error, onSelect }: Props) {
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
        <div key={item.id} className="flex flex-col gap-2 rounded-md border border-border p-3">
          <div className="min-h-20 overflow-hidden rounded border border-border/60 bg-muted/30">
            {item.kind === "image" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={item.url} alt="" className="h-24 w-full object-cover" />
            ) : item.kind === "video" ? (
              <VideoThumbnailPreview src={item.url} className="h-24 w-full object-cover" />
            ) : item.kind === "audio" ? (
              <div className="flex h-24 items-center justify-center px-2 text-xs text-muted-foreground">Аудио</div>
            ) : (
              <div className="flex h-24 items-center justify-center px-2 text-xs text-muted-foreground">Файл</div>
            )}
          </div>
          <p className="truncate text-sm font-medium" title={pickerTitle(item)}>
            {pickerTitle(item)}
          </p>
          {item.displayName?.trim() ? (
            <p className="truncate text-xs text-muted-foreground" title={item.filename}>
              Исходное имя: {item.filename}
            </p>
          ) : null}
          <p className="text-xs text-muted-foreground">
            {item.kind} • {shortDate(item.createdAt)}
          </p>
          <Button type="button" size="sm" onClick={() => onSelect(item)}>
            Выбрать
          </Button>
        </div>
      ))}
    </div>
  );
}
