"use client";

import { MarkdownContent } from "@/shared/ui/markdown/MarkdownContent";
import { NoContextMenuVideo } from "@/shared/ui/media/NoContextMenuVideo";

type Props = {
  title: string;
  summary: string;
  bodyMd: string;
  imageUrl: string;
  videoUrl: string;
};

function toYoutubeEmbedSrc(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    if (host === "youtu.be") {
      const id = u.pathname.replace(/^\//, "").split("/")[0];
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }
    if (host.includes("youtube.com")) {
      if (u.pathname.startsWith("/embed/")) return url;
      if (u.pathname === "/watch") {
        const id = u.searchParams.get("v");
        return id ? `https://www.youtube.com/embed/${id}` : null;
      }
      const shortsMatch = /^\/shorts\/([^/?]+)/.exec(u.pathname);
      if (shortsMatch?.[1]) {
        return `https://www.youtube.com/embed/${shortsMatch[1]}`;
      }
    }
    return null;
  } catch {
    return null;
  }
}

export function ContentPreview({ title, summary, bodyMd, imageUrl, videoUrl }: Props) {
  const youtubeEmbedSrc = videoUrl ? toYoutubeEmbedSrc(videoUrl) : null;
  return (
    <section className="rounded-xl border border-border bg-muted/10 p-4">
      <h3 className="m-0 text-base font-semibold">Предпросмотр для пациента</h3>
      <article className="mt-3 flex flex-col gap-3 rounded-lg border border-border bg-background p-4">
        <h4 className="m-0 text-lg font-semibold">{title.trim() || "Заголовок страницы"}</h4>
        {summary.trim() ? <p className="m-0 text-sm text-muted-foreground">{summary.trim()}</p> : null}
        {imageUrl.trim() ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl.trim()} alt="" className="max-h-80 max-w-full rounded object-contain" />
        ) : null}
        <MarkdownContent text={bodyMd} bodyFormat="markdown" />
        {videoUrl.trim() ? (
          youtubeEmbedSrc ? (
            <div className="relative aspect-video overflow-hidden rounded-lg">
              <iframe
                src={youtubeEmbedSrc}
                className="absolute inset-0 size-full border-0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                title={title || "preview-video"}
              />
            </div>
          ) : (
            <NoContextMenuVideo controls preload="metadata" className="max-w-full rounded-lg">
              <source src={videoUrl.trim()} />
            </NoContextMenuVideo>
          )
        ) : (
          <p className="m-0 text-sm text-muted-foreground">Видео не выбрано</p>
        )}
      </article>
    </section>
  );
}

