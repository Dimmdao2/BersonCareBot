"use client";

import type { ImgHTMLAttributes, ReactNode } from "react";
import { useState } from "react";

type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "alt"> & {
  src?: string | null;
  alt: string;
  fallback?: ReactNode;
};

/**
 * CMS/media URLs may be unavailable for guests or stale after content edits.
 * Keep the card geometry and show the local decorative fallback instead of a broken-image glyph.
 */
export function PatientHomeSafeImage({ src, alt, fallback = null, onError, ...props }: Props) {
  const [failed, setFailed] = useState(false);
  const imageSrc = src?.trim();

  if (!imageSrc || failed) return <>{fallback}</>;

  return (
    // eslint-disable-next-line @next/next/no-img-element -- CMS media can be external and may not be covered by Next remotePatterns.
    <img
      {...props}
      src={imageSrc}
      alt={alt}
      onError={(event) => {
        setFailed(true);
        onError?.(event);
      }}
    />
  );
}
