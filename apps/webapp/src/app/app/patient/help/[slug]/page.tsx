import { notFound } from "next/navigation";
import { Suspense } from "react";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { routePaths } from "@/app-layer/routes/paths";
import { env } from "@/config/env";
import { getOptionalPatientSession, patientRscPersonalDataGate } from "@/app-layer/guards/requireRole";
import { resolvePatientCanViewContent } from "@/modules/platform-access";
import { isHelpSectionSlug } from "@/modules/content-sections/types";
import { AppShell } from "@/shared/ui/AppShell";
import { PatientLoadingPatternBody } from "@/shared/ui/patientVisual";
import { toYoutubeOrRutubeEmbedSrc } from "@/shared/lib/hostingEmbedUrls";
import { parseApiMediaIdFromHref, parseApiMediaIdFromPlayableUrl } from "@/shared/lib/parseApiMediaIdFromPlayableUrl";
import { HELP_CANONICAL_ARTICLE_SLUG_BOOKING } from "@/modules/help-content/canonicalSlugs";
import { PatientContentSlugArticle } from "@/app/app/patient/content/[slug]/PatientContentSlugArticle";
import { HelpBookingAboutLink } from "../HelpBookingAboutLink";

type Props = {
  params: Promise<{ slug: string }>;
};

export const dynamic = "force-dynamic";

export default async function PatientHelpArticlePage({ params }: Props) {
  const { slug } = await params;
  const session = await getOptionalPatientSession();
  const deps = buildAppDeps();
  const dbRow = await deps.contentPages.getBySlug(slug);
  if (!dbRow || !isHelpSectionSlug(dbRow.section)) notFound();

  if (dbRow.requiresAuth) {
    const canView = await resolvePatientCanViewContent(session, slug, deps.entitlements);
    if (!canView) notFound();
  }

  const item = await deps.contentCatalog.getBySlug(slug);
  if (!item) notFound();

  const contentPath = routePaths.patientHelpArticle(slug);
  const personalTierOk =
    session ? (await patientRscPersonalDataGate(session, contentPath)) === "allow" : false;

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
      backHref={routePaths.patientHelp}
      backLabel="Справка"
      variant="patient"
      patientSuppressShellTitle
    >
      {slug === HELP_CANONICAL_ARTICLE_SLUG_BOOKING ? <HelpBookingAboutLink /> : null}
      <Suspense fallback={<PatientLoadingPatternBody pattern="heroList" />}>
        <PatientContentSlugArticle
          slug={slug}
          session={session}
          dbRow={dbRow}
          item={item}
          personalTierOk={personalTierOk}
          isDailyWarmup={false}
          practiceSource="section_page"
          videoPlayableUrl={videoPlayableUrl}
          hostedVideoIframeSrc={hostedVideoIframeSrc}
          apiMediaId={apiMediaId}
          warmupNav={null}
          orderedDailyWarmupPages={[]}
        />
      </Suspense>
    </AppShell>
  );
}
