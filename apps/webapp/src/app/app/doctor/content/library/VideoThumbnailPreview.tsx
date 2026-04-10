"use client";

import { useEffect, useRef } from "react";
import { NoContextMenuVideo } from "@/shared/ui/media/NoContextMenuVideo";

type Props = {
  src: string;
  className?: string;
};

/**
 * Статичное превью: без seek многие браузеры оставляют video пустым при preload="metadata".
 * Небольшой сдвиг currentTime заставляет декодировать первый доступный ключевой кадр.
 */
export function VideoThumbnailPreview({ src, className }: Props) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const bumpToFirstFrame = () => {
      const d = el.duration;
      if (!Number.isFinite(d) || d <= 0) return;
      const t = d < 0.2 ? d * 0.25 : Math.min(0.1, d * 0.01);
      try {
        el.currentTime = t;
      } catch {
        /* seek может бросить при битом/неподдерживаемом источнике */
      }
    };

    el.addEventListener("loadedmetadata", bumpToFirstFrame);
    if (el.readyState >= HTMLMediaElement.HAVE_METADATA) bumpToFirstFrame();
    return () => el.removeEventListener("loadedmetadata", bumpToFirstFrame);
  }, [src]);

  return (
    <NoContextMenuVideo key={src} ref={ref} className={className} preload="metadata" muted playsInline>
      <source src={src} />
    </NoContextMenuVideo>
  );
}
