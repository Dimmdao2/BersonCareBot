"use client";

import { cn } from "@/lib/utils";
import type { MediaPlaybackPayload } from "@/modules/media/playbackPayloadTypes";
import { toRutubeEmbedSrc, toYoutubeEmbedSrc } from "@/shared/lib/hostingEmbedUrls";
import { parseApiMediaIdFromMarkdownHref } from "@/shared/lib/parseApiMediaIdFromPlayableUrl";
import { PatientMediaPlaybackVideo } from "@/shared/ui/media/PatientMediaPlaybackVideo";
import { type AnchorHTMLAttributes, type ReactNode, useEffect, useState } from "react";
import type { Components } from "react-markdown";

function hostedIframeOriginAllowed(embedSrc: string): boolean {
  try {
    const u = new URL(embedSrc);
    const host = u.hostname.replace(/^www\./, "");
    if (host === "youtube.com" && u.pathname.startsWith("/embed")) return true;
    if (host === "rutube.ru" && u.pathname.startsWith("/play/embed")) return true;
    return false;
  } catch {
    return false;
  }
}

function anchorTitle(children: ReactNode): string {
  if (typeof children === "string" && children.trim()) return children.trim();
  return "Видео";
}

function isPlaybackPayload(v: unknown): v is MediaPlaybackPayload {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  const mp4 = o.mp4;
  if (!mp4 || typeof mp4 !== "object") return false;
  const mp4o = mp4 as Record<string, unknown>;
  const delivery = o.delivery;
  return (
    typeof o.mediaId === "string" &&
    typeof o.mimeType === "string" &&
    typeof mp4o.url === "string" &&
    (delivery === "hls" || delivery === "mp4" || delivery === "file")
  );
}

/**
 * Origin для распознавания абсолютных URL вида `https://…/api/media/{uuid}` в Markdown:
 * `window.location.origin` и при необходимости публичный `NEXT_PUBLIC_APP_BASE_URL`
 * (задайте тот же канонический базовый URL, что и `APP_BASE_URL` на деплое).
 */
function markdownTrustedMediaOrigins(): string[] {
  const out: string[] = [];
  if (typeof window !== "undefined") out.push(window.location.origin);
  const pub =
    typeof process.env.NEXT_PUBLIC_APP_BASE_URL === "string" ? process.env.NEXT_PUBLIC_APP_BASE_URL.trim() : "";
  if (pub) {
    try {
      const o = new URL(pub).origin;
      if (!out.includes(o)) out.push(o);
    } catch {
      /* некорректный NEXT_PUBLIC_APP_BASE_URL — игнорируем */
    }
  }
  return out;
}

function MarkdownDeferredLibraryMedia({
  href,
  children,
  className,
  anchorProps,
}: {
  href: string;
  children: ReactNode;
  className?: string | undefined;
  anchorProps: Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "children">;
}) {
  const { className: anchorClassName, ...anchorRest } = anchorProps;

  const [resolved, setResolved] = useState<
    | { kind: "link" }
    | { kind: "video"; mediaId: string; payload: MediaPlaybackPayload }
    | { kind: "audio"; src: string }
  >({ kind: "link" });

  useEffect(() => {
    let cancelled = false;
    const mediaId = parseApiMediaIdFromMarkdownHref(href, markdownTrustedMediaOrigins());

    if (!mediaId) return;

    void (async () => {
      try {
        const res = await fetch(`/api/media/${encodeURIComponent(mediaId)}/playback`, {
          credentials: "same-origin",
        });
        if (!res.ok) return;
        const json: unknown = await res.json();
        if (cancelled || !isPlaybackPayload(json)) return;
        const mime = json.mimeType.toLowerCase();
        if (mime.startsWith("video/")) {
          setResolved({ kind: "video", mediaId, payload: json });
        } else if (mime.startsWith("audio/")) {
          setResolved({ kind: "audio", src: json.mp4.url });
        }
      } catch {
        /* остаёмся ссылкой */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [href]);

  if (resolved.kind === "video") {
    return (
      <div className={cn("markdown-library-video my-3 w-full max-w-full", className, anchorClassName)}>
        <PatientMediaPlaybackVideo
          mediaId={resolved.mediaId}
          mp4Url={`/api/media/${resolved.mediaId}`}
          title={anchorTitle(children)}
          initialPlayback={resolved.payload}
          shellClassName="relative aspect-video w-full overflow-hidden rounded-lg bg-muted/30"
        />
      </div>
    );
  }

  if (resolved.kind === "audio") {
    return (
      <div className={cn("markdown-library-audio my-3 w-full max-w-full", className, anchorClassName)}>
        <audio controls preload="metadata" className="w-full max-w-full rounded-lg" src={resolved.src} />
      </div>
    );
  }

  return (
    <a href={href} className={cn(className, anchorClassName)} {...anchorRest}>
      {children}
    </a>
  );
}

export const MarkdownEmbeddedLink: Components["a"] = ({
  href,
  children,
  className,
  node: _node,
  ...rest
}) => {
  if (!href) {
    return (
      <a className={className} {...rest}>
        {children}
      </a>
    );
  }

  const hostedEmbedSrc = toYoutubeEmbedSrc(href) ?? toRutubeEmbedSrc(href);
  if (hostedEmbedSrc && hostedIframeOriginAllowed(hostedEmbedSrc)) {
    return (
      <span className={cn("markdown-host-embed my-3 block w-full max-w-full", className)}>
        <div className="relative aspect-video w-full overflow-hidden rounded-lg">
          <iframe
            src={hostedEmbedSrc}
            className="absolute inset-0 size-full border-0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            title={anchorTitle(children)}
            loading="lazy"
          />
        </div>
      </span>
    );
  }

  return (
    <MarkdownDeferredLibraryMedia key={href} href={href} className={className} anchorProps={rest}>
      {children}
    </MarkdownDeferredLibraryMedia>
  );
};
