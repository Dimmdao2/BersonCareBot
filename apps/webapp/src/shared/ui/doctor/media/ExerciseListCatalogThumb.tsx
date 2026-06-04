"use client";

import type { ExerciseMedia } from "@/modules/lfk-exercises/types";
import { cn } from "@/lib/utils";
import { MediaThumb } from "./MediaThumb";
import { exerciseMediaToPreviewUi } from "./mediaPreviewUiModel";

export type ExerciseListCatalogThumbProps = {
  media: ExerciseMedia | null | undefined;
  className?: string;
};

/**
 * 36×36 list/picker thumbnail for LFK exercise catalog rows (doctor exercises list, template picker).
 * Canonical preview path: {@link exerciseMediaToPreviewUi} → {@link MediaThumb} only.
 */
export function ExerciseListCatalogThumb({ media, className }: ExerciseListCatalogThumbProps) {
  if (!media) {
    return <div className={cn("h-9 w-9 shrink-0 rounded bg-muted", className)} aria-hidden />;
  }
  return (
    <div
      className={cn(
        "relative h-9 w-9 shrink-0 overflow-hidden rounded border border-border/40 bg-muted/30",
        className,
      )}
    >
      <MediaThumb
        media={exerciseMediaToPreviewUi(media)}
        className="size-full"
        imgClassName="size-full object-cover"
        sizes="36px"
      />
    </div>
  );
}
