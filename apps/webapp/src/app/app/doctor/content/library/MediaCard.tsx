"use client";

import { MediaCardActionsMenu } from "./MediaCardActionsMenu";
import { canRenderInlineImage } from "./mediaPreview";

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

  return (
    <article className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3 shadow-sm">
      <div className="overflow-hidden rounded-md border border-border/70 bg-muted/30">
        {renderInlineImage ? (
          <button
            type="button"
            className="block w-full p-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={onOpenPreview}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={item.url} alt="" className="max-h-40 w-full object-contain bg-muted/30" />
          </button>
        ) : item.kind === "video" ? (
          <button
            type="button"
            className="block w-full p-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={onOpenPreview}
            aria-label="Предпросмотр видео"
          >
            <video
              className="pointer-events-none max-h-40 w-full object-contain bg-muted/30"
              preload="metadata"
              playsInline
              muted
            >
              <source src={item.url} />
            </video>
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
