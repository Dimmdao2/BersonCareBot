'use client';

import type { ImgHTMLAttributes, ReactNode } from 'react';
import { useState } from 'react';
import type { MediaRecord } from '@/modules/media/types';
import { parseMediaFileIdFromAppUrl } from '@/shared/lib/mediaPreviewUrls';
import { MediaThumb } from '@/shared/ui/patient/media/MediaThumb';
import { libraryMediaRowToPreviewUi } from '@/shared/ui/patient/media/mediaPreviewUiModel';

type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'alt'> & {
  src?: string | null;
  fallbackSrc?: string | null;
  imageLibraryMedia?: MediaRecord | null;
  alt: string;
  fallback?: ReactNode;
};

/**
 * CMS/media URLs may be unavailable for guests or stale after content edits.
 * Keep the card geometry and show the local decorative fallback instead of a broken-image glyph.
 */
export function PatientHomeSafeImage({
  src,
  fallbackSrc,
  imageLibraryMedia,
  alt,
  fallback = null,
  onError,
  ...props
}: Props) {
  const [failedSources, setFailedSources] = useState<ReadonlySet<string>>(() => new Set());
  const imageSrc = src?.trim() || null;
  const fallbackImageSrc = fallbackSrc?.trim() || null;
  const currentSrc =
    imageSrc && !failedSources.has(imageSrc)
      ? imageSrc
      : fallbackImageSrc && fallbackImageSrc !== imageSrc && !failedSources.has(fallbackImageSrc)
        ? fallbackImageSrc
        : null;

  if (!currentSrc) return <>{fallback}</>;

  const mediaId = parseMediaFileIdFromAppUrl(currentSrc);
  if (mediaId) {
    const row = imageLibraryMedia?.id === mediaId ? imageLibraryMedia : null;
    const media = libraryMediaRowToPreviewUi({
      id: mediaId,
      kind: row?.kind === 'video' ? 'video' : 'image',
      url: row?.url ?? currentSrc,
      previewSmUrl: row?.previewSmUrl ?? null,
      previewMdUrl: row?.previewMdUrl ?? null,
      previewStatus: row?.previewStatus ?? null,
      sourceWidth: row?.sourceWidth ?? null,
      sourceHeight: row?.sourceHeight ?? null,
    });
    return (
      <MediaThumb
        media={{ ...media, standardRendition: row?.standardRendition ?? null }}
        alt={alt}
        className={props.className}
        imgClassName={props.className}
        sizes={props.sizes}
        lazy={props.loading !== 'eager'}
      />
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- CMS media can be external and may not be covered by Next remotePatterns.
    <img
      {...props}
      src={currentSrc}
      alt={alt}
      onError={(event) => {
        setFailedSources((prev) => {
          if (prev.has(currentSrc)) return prev;
          const next = new Set(prev);
          next.add(currentSrc);
          return next;
        });
        onError?.(event);
      }}
    />
  );
}
