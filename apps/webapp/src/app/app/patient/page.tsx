/**
 * Главное меню пациента («/app/patient»).
 * Доступно без входа (гость): общие блоки; персональные секции — при наличии сессии.
 * Набор блоков фильтруется по PlatformEntry (bot vs standalone).
 */

import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { getOptionalPatientSession } from "@/app-layer/guards/requireRole";
import { patientHomeBlocksByPlatform, type HomeBlockId } from "@/app-layer/routes/navigation";
import { MiniStats } from "@/modules/diaries/components/MiniStats";
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
import { loadMiniStatsProps } from "./home/loadMiniStats";
import { PatientHomeCabinetSection } from "./home/PatientHomeCabinetSection";
import { PatientHomeLessonsSection } from "./home/PatientHomeLessonsSection";
import { PatientHomeMailingsSection } from "./home/PatientHomeMailingsSection";
import { PatientHomeMotivationSection } from "./home/PatientHomeMotivationSection";
import { PatientHomeNewsSection } from "./home/PatientHomeNewsSection";

export default async function PatientHomePage() {
  const [session, platformEntry] = await Promise.all([
    getOptionalPatientSession(),
    getPlatformEntry(),
  ]);

  const blocks = new Set<HomeBlockId>(
    platformEntry === "bot"
      ? patientHomeBlocksByPlatform.bot
      : patientHomeBlocksByPlatform.mobile,
  );

  const deps = buildAppDeps();
  const menu = deps.menu.getMenuForRole("client");
  const emergency = menu.find((i) => i.id === "emergency");
  const lessons = await deps.lessons.listLessons();

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

  const [homeNews, banner, mailings, miniStats, motivationQuote] = await Promise.all([
    blocks.has("news") ? getHomeNews() : Promise.resolve(null),
    blocks.has("news") ? getPatientHomeBannerTopic() : Promise.resolve(null),
    blocks.has("mailings") && session?.user
      ? listRecentMailingLogsForPlatformUser(session.user.userId)
      : Promise.resolve([]),
    blocks.has("stats") ? loadMiniStatsProps(deps, session) : Promise.resolve({ variant: "guest" as const }),
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
        {blocks.has("cabinet") ? <PatientHomeCabinetSection items={menu} /> : null}
        {blocks.has("materials") ? (
          <PatientHomeLessonsSection emergency={emergency} lessons={lessons} />
        ) : null}
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
        {blocks.has("stats") ? (
          <section id="patient-home-stats-section" className="flex flex-col gap-3">
            <h2 className="text-muted-foreground text-sm font-semibold uppercase tracking-wide">Статистика</h2>
            <MiniStats {...miniStats} />
          </section>
        ) : null}
        {blocks.has("channels") && session?.user != null && channelCards.length > 0 && (
          <ConnectMessengersBlock channelCards={channelCards} implementedOnly />
        )}
      </div>
    </AppShell>
  );
}
