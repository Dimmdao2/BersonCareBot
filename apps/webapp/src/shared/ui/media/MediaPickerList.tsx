"use client";

import { memo } from "react";
import { File, Image as ImageIcon, Music, Video } from "lucide-react";
import { Button } from "@/components/ui/button";

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

type ItemProps = {
  item: MediaListItem;
  onSelect: (item: MediaListItem) => void;
};

const MediaPickerListItem = memo(function MediaPickerListItem({ item, onSelect }: ItemProps) {
  const title = item.displayName?.trim() || item.filename;
  const date = (() => {
    try {
      return new Date(item.createdAt).toLocaleString("ru-RU");
    } catch {
      return item.createdAt;
    }
  })();

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border p-3">
      <div className="min-h-20 overflow-hidden rounded border border-border/60 bg-muted/30">
        {item.kind === "image" ? (
          <div className="flex h-24 items-center justify-center bg-muted/30" aria-hidden>
            <ImageIcon className="h-8 w-8 text-muted-foreground" />
          </div>
        ) : item.kind === "video" ? (
          <div className="flex h-24 items-center justify-center bg-muted/30" aria-hidden>
            <Video className="h-8 w-8 text-muted-foreground" />
          </div>
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
      <p className="truncate text-sm font-medium" title={title}>
        {title}
      </p>
      {item.displayName?.trim() ? (
        <p className="truncate text-xs text-muted-foreground" title={item.filename}>
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
