"use client";

import { ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RecommendationMediaItem } from "@/modules/recommendations/types";
import { MediaThumb } from "@/shared/ui/media/MediaThumb";
import { recommendationMediaItemToPreviewUi } from "@/shared/ui/media/mediaPreviewUiModel";

export type PatientCatalogMediaStaticThumbProps = {
  media: RecommendationMediaItem | null;
  /** Размер, рамка и фон коробки (`overflow-hidden` добавляется здесь). */
  frameClassName: string;
  sizes: string;
  /** Иконка пустого слота. */
  iconClassName?: string;
};

/**
 * Статичное превью каталожного медиа в кабинете пациента (рекомендации, снимки упражнений в программе и т.п.).
 *
 * Только {@link MediaThumb}: картинка, GIF по исходному URL, для видео — превью воркера из снимка (`previewSmUrl`).
 * Здесь **нет** {@code <video>}, нет иконки «кино» (Film) и нет декоративного оверлея плеера на месте миниатюры.
 * Воспроизведение — только на целевой странице/в блоке с настоящим плеером.
 */
export function PatientCatalogMediaStaticThumb(props: PatientCatalogMediaStaticThumbProps) {
  const { media, frameClassName, sizes, iconClassName = "size-5" } = props;
  const shell = cn(frameClassName, "shrink-0 overflow-hidden");
  if (!media) {
    return (
      <div className={cn(shell, "flex items-center justify-center bg-muted/25")} aria-hidden>
        <ImageIcon className={cn(iconClassName, "text-muted-foreground")} />
      </div>
    );
  }
  const ui = recommendationMediaItemToPreviewUi(media);
  return (
    <div className={shell}>
      <MediaThumb
        media={ui}
        className="h-full w-full object-cover"
        imgClassName="h-full w-full object-cover"
        sizes={sizes}
        lazy
      />
    </div>
  );
}
