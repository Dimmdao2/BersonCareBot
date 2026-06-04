"use client";

import { ImageOff } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MediaThumbPhase } from "./mediaThumbState";
import { getMediaThumbPhase } from "./mediaThumbState";
import type { MediaPreviewUiModel } from "./mediaPreviewUiModel";

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
};

export function MediaThumb({
  media,
  className,
  imgClassName,
  labels,
  lazy = true,
  sizes = "160px",
  alt = "",
}: MediaThumbProps) {
  const phase: MediaThumbPhase = getMediaThumbPhase({
    kind: media.kind,
    previewStatus: media.previewStatus,
    previewSmUrl: media.previewSmUrl,
  });
  const smUrl = media.previewSmUrl;
  const mdUrl = media.previewMdUrl;
  const skippedLabel = labels?.skipped ?? "Превью не создаётся";
  const failedLabel = labels?.failed ?? "Превью недоступно";

  if (phase === "non_visual") {
    return null;
  }

  if (phase === "ready" && smUrl?.trim()) {
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
        loading={lazy ? "lazy" : "eager"}
        decoding="async"
      />
    );
  }

  if (phase === "pending") {
    return <div className={cn("animate-pulse bg-muted/50", className)} aria-hidden />;
  }

  if (phase === "failed" || phase === "skipped") {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center gap-1 bg-muted/20 text-xs text-muted-foreground",
          className,
        )}
      >
        <ImageOff className="h-8 w-8 opacity-60" aria-hidden />
        <span>{phase === "skipped" ? skippedLabel : failedLabel}</span>
      </div>
    );
  }

  /* phase === "ready" but missing smUrl — skeleton */
  return <div className={cn("animate-pulse bg-muted/50", className)} aria-hidden />;
}
