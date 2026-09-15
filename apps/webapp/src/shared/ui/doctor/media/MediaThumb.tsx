'use client';

import { ImageOff, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { MediaThumbPhase } from './mediaThumbState';
import { getMediaThumbPhase } from './mediaThumbState';
import type { MediaPreviewUiModel } from './mediaPreviewUiModel';

export type MediaThumbProps = {
  /** Canonical preview model (grid/list/picker). Single source of truth for thumbnail rendering; do not duplicate. */
  media: MediaPreviewUiModel;
  className?: string;
  imgClassName?: string;
  labels?: { skipped?: string; failed?: string };
  lazy?: boolean;
  /** Passed to `<img sizes>` when `mdUrl` is set (srcSet 1x/2x). */
  sizes?: string;
  alt?: string;
  /**
   * `compact` — для квадратов вроде аватара (48px), куда подпись состояния физически не влезает:
   * значок уменьшается, слова уходят в `title`. Сами состояния и их разбор общие.
   */
  density?: 'default' | 'compact';
};

export function MediaThumb({
  media,
  className,
  imgClassName,
  labels,
  lazy = true,
  sizes = '160px',
  alt = '',
  density = 'default',
}: MediaThumbProps) {
  const compact = density === 'compact';
  const stateIconClass = compact ? 'h-5 w-5 opacity-60' : 'h-8 w-8 opacity-60';
  const phase: MediaThumbPhase = getMediaThumbPhase({
    kind: media.kind,
    previewStatus: media.previewStatus,
    previewSmUrl: media.previewSmUrl,
    standardRendition: media.standardRendition,
  });
  const smUrl = media.previewSmUrl;
  const mdUrl = media.previewMdUrl;
  const skippedLabel = labels?.skipped ?? 'Превью не создаётся';
  const failedLabel = labels?.failed ?? 'Превью недоступно';
  const pendingLabel = media.kind === 'video' ? 'Видео готовится' : 'Изображение готовится';

  if (phase === 'non_visual') {
    return null;
  }

  if (phase === 'ready' && smUrl?.trim()) {
    const sm = smUrl.trim();
    const md = mdUrl?.trim();
    const srcSet = md ? `${sm} 1x, ${md} 2x` : undefined;
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={sm}
        srcSet={srcSet}
        sizes={srcSet ? sizes : undefined}
        alt={alt}
        className={cn(imgClassName, className)}
        loading={lazy ? 'lazy' : 'eager'}
        decoding="async"
      />
    );
  }

  /**
   * Thumbnail not ready yet, but the stored object is our own re-encode (bounded WebP), so the
   * file itself is shown instead of a placeholder. Never reached for a raw upload.
   */
  if (phase === 'source' && media.url.trim()) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={media.url.trim()}
        alt={alt}
        className={cn(imgClassName, className)}
        loading={lazy ? 'lazy' : 'eager'}
        decoding="async"
      />
    );
  }

  if (phase === 'failed' || phase === 'skipped') {
    const label = phase === 'skipped' ? skippedLabel : failedLabel;
    return (
      <div
        className={cn(
          'flex flex-col items-center justify-center gap-1 bg-muted/20 text-xs text-muted-foreground',
          className,
        )}
        title={compact ? label : undefined}
      >
        <ImageOff className={stateIconClass} aria-hidden />
        {compact ? <span className="sr-only">{label}</span> : <span>{label}</span>}
      </div>
    );
  }

  /**
   * Nothing may be shown yet: the row carries no standard rendition, so the only bytes on hand are
   * the user's own upload (SECURITY_CANON §5). This is a wait, not a breakage, and it says so —
   * a grey box reads as a torn picture. Driven by the row alone; an `<img>` that fails to load is a
   * different condition and keeps its own wording above.
   */
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-1 bg-muted/30 text-xs text-muted-foreground',
        className,
      )}
      role="status"
      title={compact ? pendingLabel : undefined}
    >
      <Loader2 className={cn('animate-spin', stateIconClass)} aria-hidden />
      <span className={compact ? 'sr-only' : 'px-1 text-center'}>{pendingLabel}</span>
    </div>
  );
}
