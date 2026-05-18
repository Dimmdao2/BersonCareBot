"use client";

import { useCallback, useState } from "react";
import { cn } from "@/lib/utils";

type MarketingLandingImageProps = {
  src: string;
  alt: string;
  ratio: "phone" | "wide" | "square";
  className?: string;
};

/** Картинка с плейсхолдером, если файла ещё нет в `public/landing/`. */
export function MarketingLandingImage({ src, alt, ratio, className }: MarketingLandingImageProps) {
  const [loaded, setLoaded] = useState(false);
  const [broken, setBroken] = useState(false);

  const onLoad = useCallback(() => {
    setLoaded(true);
  }, []);

  const onError = useCallback(() => {
    setBroken(true);
  }, []);

  const ratioClass =
    ratio === "phone"
      ? "aspect-[9/19] max-h-[min(52vh,520px)] w-full max-w-[240px]"
      : ratio === "square"
        ? "aspect-square w-full max-w-[220px]"
        : "aspect-[4/3] w-full";

  return (
    <figure
      className={cn(
        "relative overflow-hidden rounded-[10px] border border-[#e5e7eb] bg-[linear-gradient(145deg,#f4f7fe_0%,#ffffff_55%,#eef2f9_100%)] shadow-[0_8px_24px_rgba(15,23,42,0.06)]",
        ratioClass,
        className,
      )}
    >
      {broken ? (
        <div
          className="absolute inset-0 flex items-center justify-center bg-[#e8eefb]/50"
          aria-hidden
        >
          <div className="h-12 w-12 rounded-full border-2 border-dashed border-[#284da0]/25" />
        </div>
      ) : (
        /* Локальные файлы из `public/landing/`, нужны onLoad/onError — next/image без кастомного loader не покрывает */
        // eslint-disable-next-line @next/next/no-img-element -- см. комментарий выше
        <img
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          onLoad={onLoad}
          onError={onError}
          className={cn(
            "h-full w-full object-cover transition-opacity duration-300",
            loaded ? "opacity-100" : "opacity-0",
          )}
        />
      )}
    </figure>
  );
}
