/**
 * Страница одного материала по адресу «/app/patient/content/[slug]».
 * Только для пациента. Открывается из разделов «Полезные уроки» и «Скорая помощь» по идентификатору
 * материала. Показывает заголовок, картинку, текст и блок «Видео» (плейсхолдер). Если материал не найден —
 * 404. Кнопка «Назад» ведёт в главное меню пациента.
 */

import { notFound } from "next/navigation";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { getOptionalPatientSession } from "@/app-layer/guards/requireRole";
import { AppShell } from "@/shared/ui/AppShell";

type Props = { params: Promise<{ slug: string }> };

/** Загружает материал по slug из каталога и рендерит статью. Доступно без входа. */
export default async function ContentSlugPage({ params }: Props) {
  const { slug } = await params;
  const session = await getOptionalPatientSession();
  const deps = buildAppDeps();
  const item = deps.contentCatalog.getBySlug(slug);
  if (!item) notFound();

  const backHref = "/app/patient";
  return (
    <AppShell title={item.title} user={session?.user ?? null} backHref={backHref} backLabel="Назад" variant="patient">
      <article id={`patient-content-article-${slug}`} className="panel stack">
        {item.imageUrl && (
          <img src={item.imageUrl} alt="" style={{ maxWidth: "100%", height: "auto" }} />
        )}
        <p>{item.bodyText}</p>
        <section id={`patient-content-video-section-${slug}`} className="stack" style={{ marginTop: "1rem" }}>
          <h3>Видео</h3>
          <img
            src="https://placehold.co/640x360?text=Video"
            alt=""
            style={{ maxWidth: "100%", height: "auto", borderRadius: "8px" }}
            width={640}
            height={360}
          />
        </section>
      </article>
    </AppShell>
  );
}
