/**
 * Страница одного материала по адресу «/app/patient/content/[slug]».
 * Warmup layout определяется membership в блоке `daily_warmup`, не query param.
 */

import { notFound } from "next/navigation";
import { Suspense } from "react";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { listDailyWarmupPagesForHome, type DailyWarmupListEntry } from "@/modules/patient-home/todayConfig";
import { env } from "@/config/env";
import { getOptionalPatientSession, patientRscPersonalDataGate } from "@/app-layer/guards/requireRole";
import { resolvePatientCanViewAuthOnlyContent } from "@/modules/platform-access";
import { AppShell } from "@/shared/ui/AppShell";
import { PatientBackToSectionShellRow } from "@/shared/ui/patient/PatientBackToSectionShellRow";
import { PatientLoadingPatternBody } from "@/shared/ui/patientVisual";
import { toYoutubeOrRutubeEmbedSrc } from "@/shared/lib/hostingEmbedUrls";
import { parseApiMediaIdFromHref, parseApiMediaIdFromPlayableUrl } from "@/shared/lib/parseApiMediaIdFromPlayableUrl";
import { PatientContentSlugArticle } from "./PatientContentSlugArticle";
import { resolvePatientContentWarmupPageContext } from "./patientContentWarmupPageContext";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

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
  const fromDailyWarmup = fromVal === "daily_warmup";

  const orderedDailyWarmupPages: DailyWarmupListEntry[] = await listDailyWarmupPagesForHome({
    patientHomeBlocks: deps.patientHomeBlocks,
    contentPages: deps.contentPages,
    contentSections: deps.contentSections,
    systemSettings: deps.systemSettings,
  });

  const { isDailyWarmupMember, practiceSource, warmupNav, backNav } = resolvePatientContentWarmupPageContext({
    slug,
    fromDailyWarmup,
    sectionSlug: dbRow.section,
    orderedDailyWarmupPages,
  });

  const videoPlayableUrl =
    item.videoSource?.type === "url" && item.videoSource.url.trim()
      ? item.videoSource.url.trim()
      : item.videoSource?.type === "api" && item.videoSource.mediaId.trim()
        ? item.videoSource.mediaId.startsWith("/api/media/")
          ? item.videoSource.mediaId
          : `/api/media/${item.videoSource.mediaId}`
      : undefined;
  const hostedVideoIframeSrc = videoPlayableUrl ? toYoutubeOrRutubeEmbedSrc(videoPlayableUrl) : null;

  let appTrustedOrigin: string | null = null;
  try {
    appTrustedOrigin = new URL(env.APP_BASE_URL).origin;
  } catch {
    appTrustedOrigin = null;
  }

  const apiMediaId =
    videoPlayableUrl && !hostedVideoIframeSrc
      ? (parseApiMediaIdFromPlayableUrl(videoPlayableUrl) ??
          parseApiMediaIdFromHref(videoPlayableUrl, appTrustedOrigin))
      : null;

  return (
    <AppShell
      title=""
      user={session?.user ?? null}
      backHref={backNav.backHref}
      backLabel={backNav.backLabel}
      variant="patient"
      patientSuppressShellTitle
      patientShellAboveTitleSlot={
        backNav.showBackToSectionRow ?
          <PatientBackToSectionShellRow sectionSlug={dbRow.section} />
        : undefined
      }
    >
      <Suspense fallback={<PatientLoadingPatternBody pattern="heroList" />}>
        <PatientContentSlugArticle
          slug={slug}
          session={session}
          dbRow={dbRow}
          item={item}
          personalTierOk={personalTierOk}
          isDailyWarmup={isDailyWarmupMember}
          practiceSource={practiceSource}
          videoPlayableUrl={videoPlayableUrl}
          hostedVideoIframeSrc={hostedVideoIframeSrc}
          apiMediaId={apiMediaId}
          warmupNav={warmupNav}
          orderedDailyWarmupPages={orderedDailyWarmupPages}
        />
      </Suspense>
    </AppShell>
  );
}
