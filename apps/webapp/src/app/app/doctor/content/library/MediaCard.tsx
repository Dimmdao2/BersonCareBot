"use client";

import { ImageOff } from "lucide-react";
import { MediaCardActionsMenu } from "./MediaCardActionsMenu";
import { canRenderInlineImage } from "./mediaPreview";
import type { MediaPreviewStatus } from "@/modules/media/types";

type MediaItem = {
  id: string;
  kind: "image" | "video" | "audio" | "file";
  mimeType: string;
  filename: string;
  displayName?: string | null;
  size: number;
  userId?: string | null;
  uploadedByName?: string | null;
  createdAt: string;
  url: string;
  previewSmUrl?: string | null;
  previewMdUrl?: string | null;
  previewStatus?: MediaPreviewStatus;
};

type Props = {
  item: MediaItem;
  deleting: boolean;
  copied: boolean;
  resolutionText?: string | null;
  onDelete: () => void;
  onRename: () => void;
  onMoveFolder: () => void;
  onOpenPreview: () => void;
  onCopyUrl: () => void;
  formatSize: (bytes: number) => string;
  formatDate: (iso: string) => string;
};

function mediaTitle(item: MediaItem): string {
  return item.displayName?.trim() || item.filename;
}

function MediaThumbPlaceholder({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-muted/50 ${className ?? ""}`} aria-hidden />;
}

export function MediaCard({
  item,
  deleting,
  copied,
  resolutionText,
  onDelete,
  onRename,
  onMoveFolder,
  onOpenPreview,
  onCopyUrl,
  formatSize,
  formatDate,
}: Props) {
  const renderInlineImage = item.kind === "image" && canRenderInlineImage(item.mimeType);
  const previewStatus = item.previewStatus ?? "pending";
  const thumbReady =
    (item.kind === "image" || item.kind === "video") &&
    previewStatus === "ready" &&
    Boolean(item.previewSmUrl?.trim());
  const thumbPending =
    (item.kind === "image" || item.kind === "video") &&
    (previewStatus === "pending" || (previewStatus === "ready" && !item.previewSmUrl?.trim()));
  const thumbFailed = (item.kind === "image" || item.kind === "video") && previewStatus === "failed";
  const thumbSkipped = (item.kind === "image" || item.kind === "video") && previewStatus === "skipped";
  const thumbNoPreview = thumbFailed || thumbSkipped;

  return (
    <article className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3 shadow-sm">
      <div className="overflow-hidden rounded-md border border-border/70 bg-muted/30">
        {renderInlineImage ? (
          <button
            type="button"
            className="block w-full p-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={onOpenPreview}
          >
            {thumbReady ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={item.previewSmUrl!} alt="" className="max-h-40 w-full object-contain bg-muted/30" />
            ) : thumbPending ? (
              <MediaThumbPlaceholder className="h-40 w-full" />
            ) : thumbNoPreview ? (
              <div className="flex h-40 w-full flex-col items-center justify-center gap-1 bg-muted/20 text-xs text-muted-foreground">
                <ImageOff className="h-8 w-8 opacity-60" aria-hidden />
                <span>{thumbSkipped ? "Превью не создаётся" : "Превью недоступно"}</span>
              </div>
            ) : (
              <div className="flex h-40 w-full items-center justify-center bg-muted/20 text-sm text-muted-foreground">
                Изображение
              </div>
            )}
          </button>
        ) : item.kind === "video" ? (
          <button
            type="button"
            className="block w-full p-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Предпросмотр видео"
            onClick={onOpenPreview}
          >
            {thumbReady ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={item.previewSmUrl!} alt="" className="max-h-40 w-full object-contain bg-muted/30" />
            ) : thumbPending ? (
              <MediaThumbPlaceholder className="h-40 w-full" />
            ) : thumbNoPreview ? (
              <div className="flex h-40 w-full flex-col items-center justify-center gap-1 bg-muted/20 text-xs text-muted-foreground">
                <ImageOff className="h-8 w-8 opacity-60" aria-hidden />
                <span>{thumbSkipped ? "Превью не создаётся" : "Превью недоступно"}</span>
              </div>
            ) : (
              <div className="flex h-40 w-full items-center justify-center bg-muted/20 text-sm text-muted-foreground">
                Видео
              </div>
            )}
          </button>
        ) : item.kind === "audio" ? (
          <div className="p-3">
            <audio controls preload="metadata" className="w-full">
              <source src={item.url} />
            </audio>
          </div>
        ) : (
          <div className="flex h-40 w-full items-center justify-center bg-muted/20 text-sm text-muted-foreground">
            Файл
          </div>
        )}
      </div>

      <div className="flex min-w-0 items-start justify-between gap-2">
        <p className="min-w-0 flex-1 truncate text-sm font-medium" title={mediaTitle(item)}>
          {mediaTitle(item)}
        </p>
        <MediaCardActionsMenu
          item={item}
          resolutionText={resolutionText}
          copied={copied}
          deleting={deleting}
          onCopyUrl={onCopyUrl}
          onRename={onRename}
          onMoveFolder={onMoveFolder}
          onDelete={onDelete}
          onOpenPreview={item.kind === "file" || item.kind === "video" ? onOpenPreview : undefined}
          formatSize={formatSize}
          formatDate={formatDate}
        />
      </div>
    </article>
  );
}
