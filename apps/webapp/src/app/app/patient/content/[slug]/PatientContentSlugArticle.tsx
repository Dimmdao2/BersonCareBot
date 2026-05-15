import Link from "next/link";
import { Clock3 } from "lucide-react";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { routePaths } from "@/app-layer/routes/paths";
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
import { parsePatientHomeMoodIcons } from "@/modules/patient-home/patientHomeMoodIcons";
import type { MediaPlaybackPayload } from "@/modules/media/playbackPayloadTypes";
import type { ContentStubItem } from "@/modules/content-catalog/types";
import type { ContentPageRow } from "@/infra/repos/pgContentPages";
import type { AppSession } from "@/shared/types/session";
import { PatientContentAdaptiveVideo } from "./PatientContentAdaptiveVideo";
import { PatientContentMaterialRating } from "./PatientContentMaterialRating";
import { PatientContentPracticeComplete } from "./PatientContentPracticeComplete";
import { PatientDailyWarmupHeroCover } from "./PatientDailyWarmupHeroCover";

type Props = {
  slug: string;
  session: AppSession | null;
  dbRow: ContentPageRow;
  item: ContentStubItem;
  personalTierOk: boolean;
  practiceSource: "daily_warmup" | "section_page";
  videoPlayableUrl: string | undefined;
  youtubeEmbedSrc: string | null;
  apiMediaId: string | null;
};

export async function PatientContentSlugArticle({
  slug,
  session,
  dbRow,
  item,
  personalTierOk,
  practiceSource,
  videoPlayableUrl,
  youtubeEmbedSrc,
  apiMediaId,
}: Props) {
  const deps = buildAppDeps();

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

  const moodSetting = await deps.systemSettings.getSetting("patient_home_mood_icons", "admin");
  const moodIconOptions = parsePatientHomeMoodIcons(moodSetting?.valueJson ?? null);

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

  const contentPath = `/app/patient/content/${encodeURIComponent(slug)}`;
  const showWarmupBadge = practiceSource === "daily_warmup";
  const hasDecorImage = Boolean(item.imageUrl);
  const anonymousGuest = session === null;

  return (
    <article id={`patient-content-article-${slug}`} className="flex flex-col gap-3 lg:gap-4">
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

      {!showWarmupBadge && item.bodyText?.trim() ? (
        <div className={patientCardClass}>
          <MarkdownContent text={item.bodyText} bodyFormat={item.bodyFormat ?? "markdown"} />
        </div>
      ) : null}

      <PatientContentPracticeComplete
        contentPageId={dbRow.id}
        contentPath={contentPath}
        practiceSource={practiceSource}
        guest={session === null}
        needsActivation={session !== null && !personalTierOk}
        moodIconOptions={moodIconOptions}
      />

      {!showWarmupBadge ? (
        <PatientContentMaterialRating
          contentPageId={dbRow.id}
          guest={session === null}
          needsActivation={session !== null && !personalTierOk}
          className="mt-2"
        />
      ) : null}

      {showWarmupBadge && item.bodyText?.trim() ? (
        <div className={cn(patientCardClass, patientDailyWarmupDetailMarkdownClass)}>
          <MarkdownContent text={item.bodyText} bodyFormat={item.bodyFormat ?? "markdown"} />
        </div>
      ) : null}

      {showWarmupBadge ? (
        <PatientContentMaterialRating
          contentPageId={dbRow.id}
          guest={session === null}
          needsActivation={session !== null && !personalTierOk}
          className="mt-2"
        />
      ) : null}

      {courseCta ? (
        <section id={`patient-content-course-cta-${slug}`} className={cn(patientSectionSurfaceClass)}>
          <p className="text-sm font-medium">Это часть курса «{courseCta.courseTitle}»</p>
          <Link
            href={courseCta.href}
            className={cn(patientPrimaryActionClass, "mt-3 !min-h-10 w-full text-sm sm:w-auto")}
          >
            Открыть курс
          </Link>
        </section>
      ) : null}
    </article>
  );
}
