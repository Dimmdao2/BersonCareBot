"use client";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { canRenderInlineImage } from "./mediaPreview";

type MediaItem = {
  id: string;
  kind: "image" | "video" | "audio" | "file";
  mimeType: string;
  filename: string;
  displayName?: string | null;
  size: number;
  createdAt: string;
  url: string;
};

type Props = {
  open: boolean;
  item: MediaItem | null;
  onOpenChange: (open: boolean) => void;
  onPrev?: () => void;
  onNext?: () => void;
};

export function MediaLightbox({ open, item, onOpenChange, onPrev, onNext }: Props) {
  const title = item ? item.displayName?.trim() || item.filename : "Просмотр файла";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] w-[95vw] max-w-5xl overflow-auto">
        <DialogTitle>{title}</DialogTitle>
        {!item ? null : (
          <div className="flex flex-col gap-3">
            {item.kind === "image" && canRenderInlineImage(item.mimeType) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={item.url} alt="" className="max-h-[70vh] w-full rounded-md object-contain" />
            ) : item.kind === "video" ? (
              <div className="flex w-full min-w-0 justify-center rounded-md bg-muted/40">
                <video
                  className="max-h-[70vh] max-w-full object-contain"
                  controls
                  preload="metadata"
                  autoPlay
                  playsInline
                >
                  <source src={item.url} />
                </video>
              </div>
            ) : item.kind === "audio" ? (
              <audio controls preload="metadata" className="w-full">
                <source src={item.url} />
              </audio>
            ) : (
              <a className="text-primary underline" href={item.url} target="_blank" rel="noreferrer">
                Открыть файл в новой вкладке
              </a>
            )}
            <div className="flex items-center justify-between gap-2">
              <Button type="button" variant="outline" onClick={onPrev} disabled={!onPrev}>
                Предыдущий
              </Button>
              <Button type="button" variant="outline" onClick={onNext} disabled={!onNext}>
                Следующий
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

