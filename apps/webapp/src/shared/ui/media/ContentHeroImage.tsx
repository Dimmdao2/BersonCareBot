"use client";

import { useEffect, useState } from "react";
import type { MediaRecord } from "@/modules/media/types";
import { parseMediaFileIdFromAppUrl } from "@/shared/lib/mediaPreviewUrls";
import { fetchAdminMediaListItem } from "@/shared/ui/media/fetchAdminMediaListItem";
import type { MediaListItem } from "@/shared/ui/media/MediaPickerList";
import { MediaThumb } from "@/shared/ui/media/MediaThumb";
import { libraryMediaRowToPreviewUi } from "@/shared/ui/media/mediaPreviewUiModel";
import { cn } from "@/lib/utils";

function mediaListItemToRecord(item: MediaListItem): MediaRecord {
  return {
    id: item.id,
    kind: item.kind,
    mimeType: item.mimeType,
    filename: item.filename,
    displayName: item.displayName,
    size: item.size,
    createdAt: item.createdAt,
    url: item.url,
    previewSmUrl: item.previewSmUrl,
    previewMdUrl: item.previewMdUrl,
    previewStatus: item.previewStatus,
  };
}

type Props = {
  imageUrl?: string;
  /** Server-resolved row when `imageUrl` is `/api/media/{uuid}` (patient catalog). */
  imageLibraryMedia?: MediaRecord | null;
  /** Doctor CMS preview: fetch row from admin API when server did not attach media. */
  hydrateFromAdminApi?: boolean;
  className?: string;
  imgClassName?: string;
};

/**
 * Article hero: library URLs use `MediaThumb` + preview pipeline only; other URLs render as plain `<img>`.
 */
export function ContentHeroImage({
  imageUrl,
  imageLibraryMedia,
  hydrateFromAdminApi = false,
  className,
  imgClassName,
}: Props) {
  const [clientRow, setClientRow] = useState<MediaRecord | null>(null);

  useEffect(() => {
    if (!hydrateFromAdminApi) {
      queueMicrotask(() => setClientRow(null));
      return;
    }
    const raw = imageUrl?.trim();
    if (!raw) {
      queueMicrotask(() => setClientRow(null));
      return;
    }
    const id = parseMediaFileIdFromAppUrl(raw);
    if (!id) {
      queueMicrotask(() => setClientRow(null));
      return;
    }
    if (imageLibraryMedia) {
      queueMicrotask(() => setClientRow(null));
      return;
    }

    const ac = new AbortController();
    queueMicrotask(() => setClientRow(null));
    void fetchAdminMediaListItem(id, { signal: ac.signal })
      .then((item) => {
        if (ac.signal.aborted || !item) return;
        setClientRow(mediaListItemToRecord(item));
      })
      .catch(() => {});
    return () => ac.abort();
  }, [hydrateFromAdminApi, imageUrl, imageLibraryMedia]);

  const raw = imageUrl?.trim();
  if (!raw) return null;

  const mediaId = parseMediaFileIdFromAppUrl(raw);
  if (mediaId) {
    const row = imageLibraryMedia ?? (hydrateFromAdminApi ? clientRow : undefined);
    const kind = row?.kind === "video" ? "video" : "image";
    const media = row
      ? libraryMediaRowToPreviewUi({
          id: row.id,
          kind,
          url: row.url ?? `/api/media/${row.id}`,
          previewSmUrl: row.previewSmUrl,
          previewMdUrl: row.previewMdUrl,
          previewStatus: row.previewStatus,
          sourceWidth: row.sourceWidth,
          sourceHeight: row.sourceHeight,
        })
      : libraryMediaRowToPreviewUi({
          id: mediaId,
          kind: "image",
          url: raw,
          previewSmUrl: null,
          previewMdUrl: null,
          previewStatus: null,
        });

    return (
      <MediaThumb
        media={media}
        className={cn("w-full", className)}
        imgClassName={cn("max-w-full h-auto object-contain", imgClassName)}
        sizes="(max-width: 768px) 100vw, 720px"
        lazy={false}
      />
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- external CMS URLs (non-library)
    <img src={raw} alt="" className={cn("max-w-full h-auto", className, imgClassName)} />
  );
}
