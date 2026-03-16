import { notFound } from "next/navigation";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requirePatientAccess } from "@/app-layer/guards/requireRole";
import { AppShell } from "@/shared/ui/AppShell";

type Props = { params: Promise<{ slug: string }> };

export default async function ContentSlugPage({ params }: Props) {
  const { slug } = await params;
  const session = await requirePatientAccess();
  const deps = buildAppDeps();
  const item = deps.contentCatalog.getBySlug(slug);
  if (!item) notFound();

  const backHref = "/app/patient";
  return (
    <AppShell title={item.title} user={session.user} backHref={backHref} backLabel="Назад">
      <article className="panel stack">
        {item.imageUrl && (
          <img src={item.imageUrl} alt="" style={{ maxWidth: "100%", height: "auto" }} />
        )}
        <p>{item.bodyText}</p>
        {item.videoSource && (
          <section className="stack" style={{ marginTop: "1rem" }}>
            <h3>Видео</h3>
            {item.videoSource.type === "url" ? (
              <video
                controls
                playsInline
                preload="metadata"
                style={{ maxWidth: "100%", borderRadius: "8px" }}
                src={item.videoSource.url}
              >
                Ваш браузер не поддерживает воспроизведение видео.
              </video>
            ) : (
              <video
                controls
                playsInline
                preload="metadata"
                style={{ maxWidth: "100%", borderRadius: "8px" }}
                src={`/api/media/${item.videoSource.mediaId}`}
              >
                Ваш браузер не поддерживает воспроизведение видео.
              </video>
            )}
          </section>
        )}
      </article>
    </AppShell>
  );
}
