/**
 * Страница одного материала по адресу «/app/patient/content/[slug]».
 * Только для пациента. Открывается из разделов «Полезные уроки» и «Скорая помощь» по идентификатору
 * материала. Показывает заголовок, картинку, текст и блок «Видео» (YouTube или файл по URL). Если материал не найден —
 * 404. Кнопка «Назад» ведёт в главное меню пациента.
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { getOptionalPatientSession, patientRscPersonalDataGate } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";
import { resolvePatientCanViewAuthOnlyContent } from "@/modules/platform-access";
import { PageSection } from "@/components/common/layout/PageSection";
import { AppShell } from "@/shared/ui/AppShell";
import { cn } from "@/lib/utils";
import { MarkdownContent } from "@/shared/ui/markdown/MarkdownContent";
import { resolveMediaPlaybackPayload } from "@/app-layer/media/resolveMediaPlaybackPayload";
import { ContentHeroImage } from "@/shared/ui/media/ContentHeroImage";
import { patientMutedTextClass, patientPrimaryActionClass, patientSectionSurfaceClass } from "@/shared/ui/patientVisual";
import { getConfigBool } from "@/modules/system-settings/configAdapter";
import type { MediaPlaybackPayload } from "@/modules/media/playbackPayloadTypes";
import { parseApiMediaIdFromPlayableUrl } from "@/shared/lib/parseApiMediaIdFromPlayableUrl";
import { PatientContentAdaptiveVideo } from "./PatientContentAdaptiveVideo";
import { PatientContentPracticeComplete } from "./PatientContentPracticeComplete";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
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

/** Загружает материал по slug из каталога и рендерит статью. Доступно без входа. */
export default async function ContentSlugPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const sp = await searchParams;
  const session = await getOptionalPatientSession();
  const deps = buildAppDeps();
  const dbRow = await deps.contentPages.getBySlug(slug);
  if (dbRow?.requiresAuth) {
    const canView = await resolvePatientCanViewAuthOnlyContent(session);
    if (!canView) notFound();
  }
  const item = await deps.contentCatalog.getBySlug(slug);
  if (!item) notFound();
  if (!dbRow) notFound();

  const contentPath = `/app/patient/content/${encodeURIComponent(slug)}`;
  const personalTierOk =
    session ? (await patientRscPersonalDataGate(session, contentPath)) === "allow" : false;
  const rawFrom = sp.from;
  const fromVal = Array.isArray(rawFrom) ? rawFrom[0] : rawFrom;
  const practiceSource = fromVal === "daily_warmup" ? ("daily_warmup" as const) : ("section_page" as const);

  const videoPlayableUrl =
    item.videoSource?.type === "url" && item.videoSource.url.trim()
      ? item.videoSource.url.trim()
      : item.videoSource?.type === "api" && item.videoSource.mediaId.trim()
        ? item.videoSource.mediaId.startsWith("/api/media/")
          ? item.videoSource.mediaId
          : `/api/media/${item.videoSource.mediaId}`
      : undefined;
  const youtubeEmbedSrc = videoPlayableUrl ? toYoutubeEmbedSrc(videoPlayableUrl) : null;

  const apiMediaId =
    videoPlayableUrl && !youtubeEmbedSrc ? parseApiMediaIdFromPlayableUrl(videoPlayableUrl) : null;

  let patientPlaybackInitial: MediaPlaybackPayload | null = null;
  if (apiMediaId && session) {
    const playbackEnabled = await getConfigBool("video_playback_api_enabled", false);
    if (playbackEnabled) {
      const resolved = await resolveMediaPlaybackPayload({
        id: apiMediaId,
        session,
        adminPrefer: null,
      });
      if (resolved.ok) {
        patientPlaybackInitial = resolved.data;
      }
    }
  }

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
              <PatientContentAdaptiveVideo
                mediaId={apiMediaId ?? ""}
                mp4Url={videoPlayableUrl}
                title={item.title}
                initialPlayback={patientPlaybackInitial}
              />
            )}
          </PageSection>
        ) : (
          <PageSection as="section" id={`patient-content-video-section-${slug}`} className="mt-4 flex flex-col gap-2">
            <p className={patientMutedTextClass}>Видео будет добавлено в ближайшее время.</p>
          </PageSection>
        )}
        <PatientContentPracticeComplete
          contentPageId={dbRow.id}
          contentPath={contentPath}
          practiceSource={practiceSource}
          guest={session === null}
          needsActivation={session !== null && !personalTierOk}
        />
        {courseCta ? (
          <PageSection
            as="section"
            id={`patient-content-course-cta-${slug}`}
            className={cn(patientSectionSurfaceClass, "mt-4")}
          >
            <p className="text-sm font-medium">
              Это часть курса «{courseCta.courseTitle}»
            </p>
            <Link
              href={courseCta.href}
              className={cn(patientPrimaryActionClass, "mt-3 !min-h-10 w-full text-sm sm:w-auto")}
            >
              Открыть курс
            </Link>
          </PageSection>
        ) : null}
      </article>
    </AppShell>
  );
}
