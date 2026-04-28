/**
 * Страница одного материала по адресу «/app/patient/content/[slug]».
 * Только для пациента. Открывается из разделов «Полезные уроки» и «Скорая помощь» по идентификатору
 * материала. Показывает заголовок, картинку, текст и блок «Видео» (YouTube или файл по URL). Если материал не найден —
 * 404. Кнопка «Назад» ведёт в главное меню пациента.
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { getOptionalPatientSession } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";
import { resolvePatientCanViewAuthOnlyContent } from "@/modules/platform-access";
import { PageSection } from "@/components/common/layout/PageSection";
import { AppShell } from "@/shared/ui/AppShell";
import { MarkdownContent } from "@/shared/ui/markdown/MarkdownContent";
import { ContentHeroImage } from "@/shared/ui/media/ContentHeroImage";
import { NoContextMenuVideo } from "@/shared/ui/media/NoContextMenuVideo";

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
  const dbRow = await deps.contentPages.getBySlug(slug);
  if (dbRow?.requiresAuth) {
    const canView = await resolvePatientCanViewAuthOnlyContent(session);
    if (!canView) notFound();
  }
  const item = await deps.contentCatalog.getBySlug(slug);
  if (!item) notFound();

  const videoPlayableUrl =
    item.videoSource?.type === "url" && item.videoSource.url.trim()
      ? item.videoSource.url.trim()
      : item.videoSource?.type === "api" && item.videoSource.mediaId.trim()
        ? item.videoSource.mediaId.startsWith("/api/media/")
          ? item.videoSource.mediaId
          : `/api/media/${item.videoSource.mediaId}`
      : undefined;
  const youtubeEmbedSrc = videoPlayableUrl ? toYoutubeEmbedSrc(videoPlayableUrl) : null;

  let courseCta: { courseTitle: string; href: string } | null = null;
  if (dbRow?.linkedCourseId) {
    const course = await deps.courses.getCourseForDoctor(dbRow.linkedCourseId);
    if (course?.status === "published") {
      let href = `${routePaths.patientCourses}?highlight=${encodeURIComponent(course.id)}`;
      const userId = session?.user?.userId;
      if (userId) {
        const instances = await deps.treatmentProgramInstance.listForPatient(userId);
        const match = instances.find((i) => i.status === "active" && i.templateId === course.programTemplateId);
        if (match) {
          href = routePaths.patientTreatmentProgram(match.id);
        }
      }
      courseCta = { courseTitle: course.title, href };
    }
  }

  const backHref = "/app/patient";
  return (
    <AppShell title={item.title} user={session?.user ?? null} backHref={backHref} backLabel="Назад" variant="patient">
      <article id={`patient-content-article-${slug}`} className="flex flex-col gap-4">
        {item.imageUrl ? (
          <ContentHeroImage imageUrl={item.imageUrl} imageLibraryMedia={item.imageLibraryMedia} />
        ) : null}
        <MarkdownContent
          text={item.bodyText}
          bodyFormat={item.bodyFormat ?? "markdown"}
        />
        {videoPlayableUrl ? (
          <PageSection as="section" id={`patient-content-video-section-${slug}`} className="mt-4 flex flex-col gap-2">
            <h3 className="text-base font-medium">Видео</h3>
            {youtubeEmbedSrc ? (
              <div className="relative aspect-video overflow-hidden rounded-lg">
                <iframe
                  src={youtubeEmbedSrc}
                  className="absolute inset-0 size-full border-0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  title={item.title}
                />
              </div>
            ) : (
              <NoContextMenuVideo controls preload="metadata" className="max-w-full rounded-lg">
                <source src={videoPlayableUrl} />
              </NoContextMenuVideo>
            )}
          </PageSection>
        ) : (
          <PageSection as="section" id={`patient-content-video-section-${slug}`} className="mt-4 flex flex-col gap-2">
            <p className="text-muted-foreground">Видео будет добавлено в ближайшее время.</p>
          </PageSection>
        )}
        {courseCta ? (
          <PageSection
            as="section"
            id={`patient-content-course-cta-${slug}`}
            className="mt-4 rounded-2xl border border-border bg-card p-4 shadow-sm"
          >
            <p className="text-sm font-medium">
              Это часть курса «{courseCta.courseTitle}»
            </p>
            <Link
              href={courseCta.href}
              className="mt-3 inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            >
              Открыть курс
            </Link>
          </PageSection>
        ) : null}
      </article>
    </AppShell>
  );
}
