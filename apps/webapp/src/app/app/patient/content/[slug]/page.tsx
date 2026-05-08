/**
 * Страница одного материала по адресу «/app/patient/content/[slug]».
 * Только для пациента. Открывается из разделов «Полезные уроки» и «Скорая помощь» по идентификатору
 * материала. Показывает заголовок, картинку, текст и блок «Видео» (YouTube или файл по URL). Если материал не найден —
 * 404. Кнопка «Назад» ведёт в главное меню пациента.
 */

import Link from "next/link";
import { Clock3 } from "lucide-react";
import { notFound } from "next/navigation";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { getOptionalPatientSession, patientRscPersonalDataGate } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";
import { resolvePatientCanViewAuthOnlyContent } from "@/modules/platform-access";
import { AppShell } from "@/shared/ui/AppShell";
import { cn } from "@/lib/utils";
import { MarkdownContent } from "@/shared/ui/markdown/MarkdownContent";
import { resolveMediaPlaybackPayload } from "@/app-layer/media/resolveMediaPlaybackPayload";
import { ContentHeroImage } from "@/shared/ui/media/ContentHeroImage";
import {
  patientCardClass,
  patientMutedTextClass,
  patientPrimaryActionClass,
  patientProgramItemHeroTitleClass,
  patientSectionSurfaceClass,
} from "@/shared/ui/patientVisual";
import {
  patientDailyWarmupDetailHeroGeometryClass,
  patientDailyWarmupDetailHeroTextColumnClass,
  patientDailyWarmupDetailHeroTitleClampClass,
  patientDailyWarmupDetailMarkdownClass,
  patientHomeCardHeroClass,
  patientHomeHeroBadgeClass,
  patientHomeHeroDurationBadgeClass,
  patientHomeHeroSummaryClampClass,
} from "@/app/app/patient/home/patientHomeCardStyles";
import { getConfigBool } from "@/modules/system-settings/configAdapter";
import type { MediaPlaybackPayload } from "@/modules/media/playbackPayloadTypes";
import { parseApiMediaIdFromPlayableUrl } from "@/shared/lib/parseApiMediaIdFromPlayableUrl";
import { PatientContentAdaptiveVideo } from "./PatientContentAdaptiveVideo";
import { PatientContentPracticeComplete } from "./PatientContentPracticeComplete";
import { PatientDailyWarmupHeroCover } from "./PatientDailyWarmupHeroCover";

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
  const showWarmupBadge = practiceSource === "daily_warmup";
  const hasDecorImage = Boolean(item.imageUrl);
  const anonymousGuest = session === null;

  return (
    <AppShell
      title={item.title}
      user={session?.user ?? null}
      backHref={backHref}
      backLabel="Назад"
      variant="patient"
      patientSuppressShellTitle
    >
      <article id={`patient-content-article-${slug}`} className="flex flex-col gap-3 lg:gap-4">

        {/* Hero: разминка дня — компактнее экрана главной; слот обложки — PatientDailyWarmupHeroCover */}
        {showWarmupBadge ? (
          <div className={patientDailyWarmupDetailHeroGeometryClass}>
            <div className="relative z-20 flex h-6 shrink-0 items-start justify-start gap-1.5">
              <span className={patientHomeHeroBadgeClass}>Разминка дня</span>
              <span className={patientHomeHeroDurationBadgeClass}>
                <Clock3 className="size-3.5 shrink-0" aria-hidden />
                5 мин
              </span>
            </div>
            <div className={patientDailyWarmupDetailHeroTextColumnClass}>
              <h1 id={`patient-content-warmup-title-${slug}`} className={patientDailyWarmupDetailHeroTitleClampClass}>
                {item.title}
              </h1>
              {item.summary?.trim() ?
                <p className={patientHomeHeroSummaryClampClass}>{item.summary.trim()}</p>
              : <div className="mt-1 min-h-8 shrink-0 md:mt-2 md:min-h-[3rem]" aria-hidden />}
            </div>
            <PatientDailyWarmupHeroCover imageUrl={item.imageUrl} anonymousGuest={anonymousGuest} />
          </div>
        ) : (
          <div
            className={cn(
              patientHomeCardHeroClass,
              "relative isolate overflow-hidden p-4 pt-3 lg:p-5",
              hasDecorImage && "min-h-[160px] min-[380px]:min-h-[172px] lg:min-h-[200px]",
            )}
          >
            <h1
              className={cn(
                patientProgramItemHeroTitleClass,
                "relative z-10 mt-2 line-clamp-3",
                hasDecorImage && "pr-[108px] min-[380px]:pr-[124px] lg:pr-[180px]",
              )}
            >
              {item.title}
            </h1>
            {hasDecorImage ? (
              <div
                className="pointer-events-none absolute inset-y-0 right-0 z-[1] flex w-[96px] items-end overflow-hidden min-[380px]:w-[112px] lg:w-[164px]"
                aria-hidden
              >
                <ContentHeroImage
                  imageUrl={item.imageUrl}
                  imageLibraryMedia={item.imageLibraryMedia}
                  imgClassName="h-full w-full object-contain object-right-bottom drop-shadow-lg"
                />
              </div>
            ) : null}
          </div>
        )}

        {/* Video */}
        {videoPlayableUrl ? (
          <section
            id={`patient-content-video-section-${slug}`}
            className="overflow-hidden rounded-[var(--patient-card-radius-mobile)] shadow-[var(--patient-shadow-card-mobile)] lg:rounded-[var(--patient-card-radius-desktop)] lg:shadow-[var(--patient-shadow-card-desktop)]"
          >
            {youtubeEmbedSrc ? (
              <div className="relative aspect-video">
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
          </section>
        ) : (
          <section id={`patient-content-video-section-${slug}`} className={cn(patientCardClass, "py-3")}>
            <p className={patientMutedTextClass}>Видео будет добавлено в ближайшее время.</p>
          </section>
        )}

        {/* Body text — для разминки ниже кнопки «Я выполнил(а) практику» */}
        {!showWarmupBadge && item.bodyText?.trim() ? (
          <div className={patientCardClass}>
            <MarkdownContent
              text={item.bodyText}
              bodyFormat={item.bodyFormat ?? "markdown"}
            />
          </div>
        ) : null}

        {/* Practice complete */}
        <PatientContentPracticeComplete
          contentPageId={dbRow.id}
          contentPath={contentPath}
          practiceSource={practiceSource}
          guest={session === null}
          needsActivation={session !== null && !personalTierOk}
        />

        {showWarmupBadge && item.bodyText?.trim() ? (
          <div className={cn(patientCardClass, patientDailyWarmupDetailMarkdownClass)}>
            <MarkdownContent
              text={item.bodyText}
              bodyFormat={item.bodyFormat ?? "markdown"}
            />
          </div>
        ) : null}

        {/* Course CTA */}
        {courseCta ? (
          <section
            id={`patient-content-course-cta-${slug}`}
            className={cn(patientSectionSurfaceClass)}
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
          </section>
        ) : null}
      </article>
    </AppShell>
  );
}
