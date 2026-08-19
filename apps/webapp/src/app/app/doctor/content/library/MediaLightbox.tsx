'use client';

import { ImageOff, Loader2 } from 'lucide-react';
import { Button } from '@/shared/ui/doctor/primitives/button';
import { NoContextMenuVideo } from '@/shared/ui/doctor/media/NoContextMenuVideo';
import { Dialog, DialogContent, DialogTitle } from '@/shared/ui/doctor/primitives/dialog';
import { cn } from '@/lib/utils';
import { canRenderInlineImage } from './mediaPreview';
import type { MediaPreviewStatus } from '@/modules/media/types';

type MediaItem = {
  id: string;
  kind: 'image' | 'video' | 'audio' | 'file';
  mimeType: string;
  filename: string;
  displayName?: string | null;
  size: number;
  createdAt: string;
  url: string;
  previewSmUrl?: string | null;
  previewMdUrl?: string | null;
  previewStatus?: MediaPreviewStatus;
  /** `media_files.standard_rendition_at IS NOT NULL` — the stored object is our own re-encode. */
  standardRendition?: boolean;
};

type Props = {
  open: boolean;
  item: MediaItem | null;
  onOpenChange: (open: boolean) => void;
  onPrev?: () => void;
  onNext?: () => void;
};

export function MediaLightbox({ open, item, onOpenChange, onPrev, onNext }: Props) {
  const title = item ? item.displayName?.trim() || item.filename : 'Просмотр файла';
  const isInlineImage = item?.kind === 'image' && canRenderInlineImage(item.mimeType);
  const generatedPreviewSrc =
    isInlineImage && item?.previewStatus === 'ready'
      ? item.previewMdUrl?.trim() || item.previewSmUrl?.trim() || null
      : null;
  /**
   * No generated preview yet. The stored file may stand in for it only after the standard
   * rendition (owner ruling 19.08) — a raw upload is never shown at full size. `failed`/`skipped`
   * mean the rendition did not happen, so they keep the unavailable state below.
   */
  const imagePreviewSrc =
    generatedPreviewSrc ??
    (isInlineImage &&
    item?.standardRendition === true &&
    item.previewStatus !== 'failed' &&
    item.previewStatus !== 'skipped'
      ? item.url.trim() || null
      : null);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] w-[95vw] max-w-5xl overflow-auto">
        <DialogTitle>{title}</DialogTitle>
        {!item ? null : (
          <div className="flex flex-col gap-3">
            {item.kind === 'image' && canRenderInlineImage(item.mimeType) ? (
              imagePreviewSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={imagePreviewSrc}
                  alt=""
                  className="max-h-[70vh] w-full rounded-md object-contain"
                />
              ) : item.previewStatus === 'failed' || item.previewStatus === 'skipped' ? (
                <div
                  className={cn(
                    'flex min-h-[40vh] flex-col items-center justify-center gap-2 rounded-md bg-muted/20 p-4 text-sm text-muted-foreground',
                  )}
                >
                  <ImageOff className="h-12 w-12 opacity-60" aria-hidden />
                  <span>
                    {item.previewStatus === 'skipped'
                      ? 'Превью для этого файла не создаётся'
                      : 'Превью изображения недоступно'}
                  </span>
                </div>
              ) : (
                /**
                 * Not converted yet: the file itself may not be shown (SECURITY_CANON §5). The
                 * screen names the wait instead of leaving a grey rectangle that reads as broken.
                 */
                <div
                  className={cn(
                    'flex h-[50vh] max-h-[70vh] w-full flex-col items-center justify-center gap-2 rounded-md bg-muted/30 p-4 text-sm text-muted-foreground',
                  )}
                  role="status"
                >
                  <Loader2 className="h-12 w-12 animate-spin opacity-60" aria-hidden />
                  <span>Изображение готовится</span>
                </div>
              )
            ) : item.kind === 'video' ? (
              <div className="flex w-full min-w-0 justify-center rounded-md bg-muted/40">
                <NoContextMenuVideo
                  className="max-h-[70vh] max-w-full object-contain"
                  controls
                  preload="metadata"
                  autoPlay
                  playsInline
                >
                  <source src={item.url} />
                </NoContextMenuVideo>
              </div>
            ) : item.kind === 'audio' ? (
              <audio controls preload="metadata" className="w-full">
                <source src={item.url} />
              </audio>
            ) : (
              <a
                className="text-primary underline"
                href={item.url}
                target="_blank"
                rel="noreferrer"
              >
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
