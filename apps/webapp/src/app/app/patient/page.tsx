/**
 * Главное меню пациента («/app/patient»).
 * Доступно без входа (гость): общие блоки; персональные секции — при наличии сессии.
 * Набор блоков фильтруется по PlatformEntry (bot vs standalone).
 * Сверху — карточки «Кабинет» / «Дневник» (см. PatientHomeBrowserHero). Запись на приём — в меню.
 */

import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { getOptionalPatientSession } from "@/app-layer/guards/requireRole";
import { patientHomeBlocksForEntry, type HomeBlockId } from "@/app-layer/routes/navigation";
import {
  getHomeNews,
  getQuoteForDay,
  incrementNewsViews,
} from "@/modules/patient-home/newsMotivation";
import { getPatientHomeBannerTopic, listRecentMailingLogsForPlatformUser } from "@/modules/patient-home/repository";
import { getPlatformEntry } from "@/shared/lib/platformCookie.server";
import { AppShell } from "@/shared/ui/AppShell";
import { ConnectMessengersBlock } from "@/shared/ui/ConnectMessengersBlock";
import { PostLoginSuggestion } from "@/shared/ui/auth/PostLoginSuggestion";
import { PatientHomeBrowserHero } from "./home/PatientHomeBrowserHero";
import { PatientHomeExtraBlocks } from "./home/PatientHomeExtraBlocks";
import { PatientHomeLessonsSection } from "./home/PatientHomeLessonsSection";
import { PatientHomeMailingsSection } from "./home/PatientHomeMailingsSection";
import { PatientHomeMotivationSection } from "./home/PatientHomeMotivationSection";
import { PatientHomeNewsSection } from "./home/PatientHomeNewsSection";

export default async function PatientHomePage() {
  const [session, platformEntry] = await Promise.all([
    getOptionalPatientSession(),
    getPlatformEntry(),
  ]);

  const blocks = new Set<HomeBlockId>(patientHomeBlocksForEntry(platformEntry));

  const deps = buildAppDeps();
  let contentSections: Awaited<ReturnType<typeof deps.contentSections.listVisible>> = [];
  try {
    contentSections = await deps.contentSections.listVisible();
  } catch {
    /* port unavailable */
  }
  const emailFields =
    session?.user != null
      ? await deps.userProjection.getProfileEmailFields(session.user.userId)
      : null;

  const channelCards =
    session?.user != null && blocks.has("channels")
      ? await deps.channelPreferences.getChannelCards(
          session.user.userId,
          session.user.bindings,
          {
            phone: session.user.phone,
            emailVerified: Boolean(emailFields?.emailVerifiedAt),
          }
        )
      : [];

  const [homeNews, banner, mailings, motivationQuote] = await Promise.all([
    blocks.has("news") ? getHomeNews() : Promise.resolve(null),
    blocks.has("news") ? getPatientHomeBannerTopic() : Promise.resolve(null),
    blocks.has("mailings") && session?.user
      ? listRecentMailingLogsForPlatformUser(session.user.userId)
      : Promise.resolve([]),
    blocks.has("motivation")
      ? getQuoteForDay(session?.user?.userId ?? "guest")
      : Promise.resolve(null),
  ]);

  if (session?.user && homeNews) {
    void incrementNewsViews(homeNews.id, session.user.userId);
  }

  return (
    <AppShell title="Главное меню" user={session?.user ?? null} variant="patient">
      <div className="flex flex-col gap-8">
        {session?.user != null ? <PostLoginSuggestion /> : null}
        {blocks.has("cabinet") ? <PatientHomeBrowserHero /> : null}
        {blocks.has("materials") ? <PatientHomeLessonsSection sections={contentSections} /> : null}
        <PatientHomeExtraBlocks blocks={blocks} />
        {blocks.has("news") ? (
          <PatientHomeNewsSection news={homeNews} banner={banner} />
        ) : null}
        {blocks.has("mailings") && session?.user && mailings.length > 0 ? (
          <PatientHomeMailingsSection userId={session.user.userId} items={mailings} />
        ) : null}
        {blocks.has("motivation") ? (
          <PatientHomeMotivationSection
            quote={
              motivationQuote?.body ??
              "Двигайтесь в комфортном темпе и прислушивайтесь к ощущениям — это помогает устойчиво закреплять привычки."
            }
          />
        ) : null}
        {blocks.has("channels") && session?.user != null && channelCards.length > 0 && (
          <ConnectMessengersBlock channelCards={channelCards} implementedOnly />
        )}
      </div>
    </AppShell>
  );
}
