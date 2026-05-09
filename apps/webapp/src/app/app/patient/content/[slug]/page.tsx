/**
 * Страница одного материала по адресу «/app/patient/content/[slug]».
 * Только для пациента. Открывается из разделов «Полезные уроки» и «Скорая помощь» по идентификатору
 * материала. Показывает заголовок, картинку, текст и блок «Видео» (YouTube или файл по URL). Если материал не найден —
 * 404. Кнопка «Назад» ведёт в главное меню пациента.
 */

import { notFound } from "next/navigation";
import { Suspense } from "react";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { getOptionalPatientSession, patientRscPersonalDataGate } from "@/app-layer/guards/requireRole";
import { resolvePatientCanViewAuthOnlyContent } from "@/modules/platform-access";
import { AppShell } from "@/shared/ui/AppShell";
import { PatientLoadingPatternBody } from "@/shared/ui/patientVisual";
import { parseApiMediaIdFromPlayableUrl } from "@/shared/lib/parseApiMediaIdFromPlayableUrl";
import { PatientContentSlugArticle } from "./PatientContentSlugArticle";

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
          youtubeEmbedSrc={youtubeEmbedSrc}
          apiMediaId={apiMediaId}
        />
      </Suspense>
    </AppShell>
  );
}
