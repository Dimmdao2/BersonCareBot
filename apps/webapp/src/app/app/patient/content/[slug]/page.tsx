/**
 * Страница одного материала по адресу «/app/patient/content/[slug]».
 * Только для пациента. Открывается из разделов «Полезные уроки» и «Скорая помощь» по идентификатору
 * материала. Показывает заголовок, картинку, текст и блок «Видео» (YouTube / RuTube по URL или файл из медиабиблиотеки). Если материал не найден —
 * 404. Кнопка «Назад» ведёт в главное меню пациента.
 */

import { notFound } from "next/navigation";
import { Suspense } from "react";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { env } from "@/config/env";
import { getOptionalPatientSession, patientRscPersonalDataGate } from "@/app-layer/guards/requireRole";
import { resolvePatientCanViewAuthOnlyContent } from "@/modules/platform-access";
import { AppShell } from "@/shared/ui/AppShell";
import { PatientLoadingPatternBody } from "@/shared/ui/patientVisual";
import { toYoutubeOrRutubeEmbedSrc } from "@/shared/lib/hostingEmbedUrls";
import { parseApiMediaIdFromHref, parseApiMediaIdFromPlayableUrl } from "@/shared/lib/parseApiMediaIdFromPlayableUrl";
import { PatientContentSlugArticle } from "./PatientContentSlugArticle";

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
  const practiceSource = fromVal === "daily_warmup" ? ("daily_warmup" as const) : ("section_page" as const);

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

  const backHref = "/app/patient";

  return (
    <AppShell
      title={item.title}
      user={session?.user ?? null}
      backHref={backHref}
      backLabel="Назад"
      variant="patient"
      patientSuppressShellTitle
    >
      <Suspense fallback={<PatientLoadingPatternBody pattern="heroList" />}>
        <PatientContentSlugArticle
          slug={slug}
          session={session}
          dbRow={dbRow}
          item={item}
          personalTierOk={personalTierOk}
          practiceSource={practiceSource}
          videoPlayableUrl={videoPlayableUrl}
          hostedVideoIframeSrc={hostedVideoIframeSrc}
          apiMediaId={apiMediaId}
        />
      </Suspense>
    </AppShell>
  );
}
