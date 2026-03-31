"use client";

import { Button } from "@/components/ui/button";

type MediaItem = {
  id: string;
  kind: "image" | "video" | "audio" | "file";
  mimeType: string;
  filename: string;
  size: number;
  createdAt: string;
  url: string;
};

type Props = {
  item: MediaItem;
  deleting: boolean;
  copied: boolean;
  onDelete: () => void;
  onOpenPreview: () => void;
  onCopyUrl: () => void;
  formatSize: (bytes: number) => string;
  formatDate: (iso: string) => string;
};

export function MediaCard({ item, deleting, copied, onDelete, onOpenPreview, onCopyUrl, formatSize, formatDate }: Props) {
  return (
    <article className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3 shadow-sm">
      <button
        type="button"
        className="overflow-hidden rounded-md border border-border/70 bg-muted/30 text-left"
        onClick={onOpenPreview}
      >
        {item.kind === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.url} alt="" className="h-40 w-full object-cover" />
        ) : item.kind === "video" ? (
          <video className="h-40 w-full object-cover" controls preload="metadata">
            <source src={item.url} />
          </video>
        ) : item.kind === "audio" ? (
          <div className="flex h-40 items-center justify-center p-3">
            <audio controls preload="metadata" className="w-full">
              <source src={item.url} />
            </audio>
          </div>
        ) : (
          <div className="flex h-40 items-center justify-center p-3">
            <a className="text-primary underline" href={item.url} target="_blank" rel="noreferrer">
              Открыть файл
            </a>
          </div>
        )}
      </button>

      <div className="space-y-1">
        <p className="truncate text-sm font-medium" title={item.filename}>
          {item.filename}
        </p>
        <p className="text-xs text-muted-foreground">
          {item.kind} • {formatSize(item.size)}
        </p>
        <p className="text-xs text-muted-foreground">{formatDate(item.createdAt)}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={onCopyUrl}>
          {copied ? "URL скопирован" : "Скопировать URL"}
        </Button>
        <Button variant="destructive" size="sm" disabled={deleting} onClick={onDelete}>
          {deleting ? "Удаление..." : "Удалить"}
        </Button>
      </div>
    </article>
  );
}

