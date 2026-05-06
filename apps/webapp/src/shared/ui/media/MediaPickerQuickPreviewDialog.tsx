"use client";

import { ImageOff } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { PatientMediaPlaybackVideo } from "@/shared/ui/media/PatientMediaPlaybackVideo";
import type { MediaListItem } from "@/shared/ui/media/MediaPickerList";

function canRenderInlineImage(mimeType: string): boolean {
  const mime = mimeType.trim().toLowerCase();
  return mime.startsWith("image/") && mime !== "image/svg+xml";
}

type Props = {
  item: MediaListItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * Быстрый просмотр строки библиотеки в пикере: md/sm для картинок; для видео — тот же
 * {@link PatientMediaPlaybackVideo}, что и в кабинете пациента (playback JSON, HLS / внутренний MP4).
 * Выбор файла — отдельно кнопкой «Выбрать» на карточке.
 */
export function MediaPickerQuickPreviewDialog({ item, open, onOpenChange }: Props) {
  const title = item ? item.displayName?.trim() || item.filename : "";

  const imagePreviewSrc =
    item?.kind === "image" &&
    item.previewStatus === "ready" &&
    canRenderInlineImage(item.mimeType)
      ? (item.previewMdUrl?.trim() || item.previewSmUrl?.trim() || null)
      : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] max-w-4xl flex-col gap-3 overflow-auto">
        <DialogHeader className="text-left">
          <DialogTitle className="line-clamp-2">{title}</DialogTitle>
        </DialogHeader>
        {!item ? null : (
          <>
            <div className="min-h-0 min-w-0 flex-1">
              {item.kind === "image" && canRenderInlineImage(item.mimeType) ? (
                imagePreviewSrc ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={imagePreviewSrc}
                    alt=""
                    className="mx-auto max-h-[65vh] w-auto max-w-full rounded-md object-contain"
                  />
                ) : item.previewStatus === "failed" || item.previewStatus === "skipped" ? (
                  <div
                    className={cn(
                      "flex min-h-[35vh] flex-col items-center justify-center gap-2 rounded-md bg-muted/20 p-6 text-sm text-muted-foreground",
                    )}
                  >
                    <ImageOff className="h-12 w-12 opacity-60" aria-hidden />
                    <span>
                      {item.previewStatus === "skipped"
                        ? "Превью для этого файла не создаётся"
                        : "Превью изображения недоступно"}
                    </span>
                  </div>
                ) : (
                  <div className="h-[45vh] max-h-[65vh] w-full animate-pulse rounded-md bg-muted/50" aria-hidden />
                )
              ) : item.kind === "video" ? (
                <PatientMediaPlaybackVideo
                  mediaId={item.id}
                  mp4Url={`/api/media/${encodeURIComponent(item.id)}`}
                  title={title}
                  initialPlayback={null}
                  shellClassName="relative aspect-video w-full max-h-[65vh] overflow-hidden rounded-md bg-black"
                />
              ) : item.kind === "audio" ? (
                <audio controls preload="metadata" className="w-full">
                  <source src={item.url} />
                </audio>
              ) : (
                <a className="text-primary underline" href={item.url} target="_blank" rel="noreferrer">
                  Открыть файл в новой вкладке
                </a>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
