/**
 * Страница одного материала по адресу «/app/patient/content/[slug]».
 * Только для пациента. Открывается из разделов «Полезные уроки» и «Скорая помощь» по идентификатору
 * материала. Показывает заголовок, картинку, текст и блок «Видео» (YouTube или файл по URL). Если материал не найден —
 * 404. Кнопка «Назад» ведёт в главное меню пациента.
 */

import { notFound } from "next/navigation";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { getOptionalPatientSession } from "@/app-layer/guards/requireRole";
import { AppShell } from "@/shared/ui/AppShell";

type Props = { params: Promise<{ slug: string }> };

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

/** Загружает материал по slug из каталога и рендерит статью. Доступно без входа. */
export default async function ContentSlugPage({ params }: Props) {
  const { slug } = await params;
  const session = await getOptionalPatientSession();
  const deps = buildAppDeps();
  const item = deps.contentCatalog.getBySlug(slug);
  if (!item) notFound();

  const videoPlayableUrl =
    item.videoSource?.type === "url" && item.videoSource.url.trim()
      ? item.videoSource.url.trim()
      : undefined;
  const youtubeEmbedSrc = videoPlayableUrl ? toYoutubeEmbedSrc(videoPlayableUrl) : null;

  const backHref = "/app/patient";
  return (
    <AppShell title={item.title} user={session?.user ?? null} backHref={backHref} backLabel="Назад" variant="patient">
      <article id={`patient-content-article-${slug}`} className="panel stack">
        {item.imageUrl && (
          <img src={item.imageUrl} alt="" style={{ maxWidth: "100%", height: "auto" }} />
        )}
        <p>{item.bodyText}</p>
        {videoPlayableUrl ? (
          <section id={`patient-content-video-section-${slug}`} className="stack" style={{ marginTop: "1rem" }}>
            <h3>Видео</h3>
            {youtubeEmbedSrc ? (
              <div style={{ position: "relative", paddingBottom: "56.25%", height: 0, overflow: "hidden", borderRadius: 8 }}>
                <iframe
                  src={youtubeEmbedSrc}
                  style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", border: "none" }}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  title={item.title}
                />
              </div>
            ) : (
              <video controls preload="metadata" style={{ maxWidth: "100%", borderRadius: 8 }}>
                <source src={videoPlayableUrl} />
              </video>
            )}
          </section>
        ) : (
          <section id={`patient-content-video-section-${slug}`} className="stack" style={{ marginTop: "1rem" }}>
            <p className="empty-state">Видео будет добавлено в ближайшее время.</p>
          </section>
        )}
      </article>
    </AppShell>
  );
}
