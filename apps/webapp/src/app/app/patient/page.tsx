/**
 * Главное меню пациента («/app/patient»).
 * Доступно без входа (гость): общие блоки; персональные секции — при наличии сессии.
 */

import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { getOptionalPatientSession } from "@/app-layer/guards/requireRole";
import { MiniStats } from "@/modules/diaries/components/MiniStats";
import {
  getHomeNews,
  getQuoteForDay,
  incrementNewsViews,
} from "@/modules/patient-home/newsMotivation";
import { getPatientHomeBannerTopic, listRecentMailingLogsForPlatformUser } from "@/modules/patient-home/repository";
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
  const session = await getOptionalPatientSession();
  const deps = buildAppDeps();
  const menu = deps.menu.getMenuForRole("client");
  const emergency = menu.find((i) => i.id === "emergency");
  const lessons = await deps.lessons.listLessons();

  const emailFields =
    session?.user != null
      ? await deps.userProjection.getProfileEmailFields(session.user.userId)
      : null;

  const channelCards =
    session?.user != null
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
    getHomeNews(),
    getPatientHomeBannerTopic(),
    session?.user
      ? listRecentMailingLogsForPlatformUser(session.user.userId)
      : Promise.resolve([]),
    loadMiniStatsProps(deps, session),
    getQuoteForDay(session?.user?.userId ?? "guest"),
  ]);

  if (session?.user && homeNews) {
    void incrementNewsViews(homeNews.id, session.user.userId);
  }

  return (
    <AppShell title="Главное меню" user={session?.user ?? null} variant="patient">
      <div className="flex flex-col gap-8">
        {session?.user != null ? <PostLoginSuggestion /> : null}
        <PatientHomeCabinetSection items={menu} />
        <PatientHomeLessonsSection emergency={emergency} lessons={lessons} />
        <PatientHomeNewsSection news={homeNews} banner={banner} />
        {session?.user && mailings.length > 0 ? (
          <PatientHomeMailingsSection userId={session.user.userId} items={mailings} />
        ) : null}
        <PatientHomeMotivationSection
          quote={
            motivationQuote?.body ??
            "Двигайтесь в комфортном темпе и прислушивайтесь к ощущениям — это помогает устойчиво закреплять привычки."
          }
        />
        <section id="patient-home-stats-section" className="flex flex-col gap-3">
          <h2 className="text-muted-foreground text-sm font-semibold uppercase tracking-wide">Статистика</h2>
          <MiniStats {...miniStats} />
        </section>
        {session?.user != null && channelCards.length > 0 && (
          <ConnectMessengersBlock channelCards={channelCards} implementedOnly />
        )}
      </div>
    </AppShell>
  );
}
