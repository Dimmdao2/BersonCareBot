/**
 * Главное меню пациента («/app/patient»).
 * Layout `/app/patient` требует сессию (`layout.tsx`); без неё — редирект на `/app?next=…`.
 * На этой странице — опциональная сессия (`getOptionalPatientSession`): блоки с персональными данными
 * только при `patientRscPersonalDataGate === allow`. Набор блоков — по PlatformEntry (bot vs standalone).
 * В боте при tier patient — отдельная главная миниаппа (`PatientMiniAppPatientHome`).
 */

import type { ReactNode } from "react";
import { DateTime } from "luxon";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { logServerRuntimeError } from "@/infra/logging/serverRuntimeLog";
import { getOptionalPatientSession, patientRscPersonalDataGate } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";
import { patientHomeBlocksForEntry, type HomeBlockId } from "@/app-layer/routes/navigation";
import {
  getHomeNews,
  getQuoteForDay,
  incrementNewsViews,
} from "@/modules/patient-home/newsMotivation";
import { getPatientHomeBannerTopic, listRecentMailingLogsForPlatformUser } from "@/modules/patient-home/repository";
import { getPlatformEntry } from "@/shared/lib/platformCookie.server";
import { resolvePatientCanViewAuthOnlyContent } from "@/modules/platform-access";
import { listEmergencyTopics } from "@/modules/emergency/service";
import type { ReminderRule } from "@/modules/reminders/types";
import type { TreatmentProgramInstanceSummary } from "@/modules/treatment-program/types";
import { getAppDisplayTimeZone } from "@/modules/system-settings/appDisplayTimezone";
import { AppShell } from "@/shared/ui/AppShell";
import { PatientMiniAppPatientHome } from "./home/PatientMiniAppPatientHome";
import { ConnectMessengersBlock } from "@/shared/ui/ConnectMessengersBlock";
import { LegalFooterLinks } from "@/shared/ui/LegalFooterLinks";
import { PatientHomeExtraBlocks } from "./home/PatientHomeExtraBlocks";
import { PatientHomeLessonsSection } from "./home/PatientHomeLessonsSection";
import { PatientHomeMailingsSection } from "./home/PatientHomeMailingsSection";
import { PatientHomeMotivationSection } from "./home/PatientHomeMotivationSection";
import { PatientHomeNewsSection } from "./home/PatientHomeNewsSection";
import { PatientHomeToday } from "./home/PatientHomeToday";
import { PatientHomeProgressBlock } from "./home/PatientHomeProgressBlock";
import {
  formatReminderScheduleLabel,
  PatientHomeNextReminderCard,
} from "./home/PatientHomeNextReminderCard";
import { PatientHomeMoodCheckin } from "./home/PatientHomeMoodCheckin";
import { PatientHomeSosCard } from "./home/PatientHomeSosCard";
import { PatientHomePlanCard } from "./home/PatientHomePlanCard";
import {
  PatientHomeSubscriptionCarousel,
  type PatientHomeSubscriptionItem,
} from "./home/PatientHomeSubscriptionCarousel";
import { PatientHomeCoursesRow, type PatientHomeCourseRowItem } from "./home/PatientHomeCoursesRow";

/** Цель «разминок за день» для полосы прогресса до появления отдельного patient-practice API. */
const PATIENT_HOME_DAILY_PRACTICE_TARGET = 3;

function lfkStreakDays(sessions: { completedAt: string }[], timeZone: string): number {
  const daysWith = new Set<string>();
  for (const s of sessions) {
    const k = DateTime.fromISO(s.completedAt, { zone: "utc" }).setZone(timeZone).toISODate();
    if (k) daysWith.add(k);
  }
  let d = DateTime.now().setZone(timeZone).startOf("day");
  const todayKey = d.toISODate();
  if (todayKey && !daysWith.has(todayKey)) {
    d = d.minus({ days: 1 });
  }
  let streak = 0;
  for (;;) {
    const key = d.toISODate();
    if (!key || !daysWith.has(key)) break;
    streak += 1;
    d = d.minus({ days: 1 });
    if (streak > 400) break;
  }
  return streak;
}

async function resolvePatientHomeReminderLabel(
  deps: ReturnType<typeof buildAppDeps>,
  rule: ReminderRule,
  complexTitleById: Record<string, string>,
): Promise<string> {
  const lo = rule.linkedObjectType;
  const id = rule.linkedObjectId;
  if (!lo) return "";
  if (lo === "lfk_complex") {
    return (id && complexTitleById[id]) || "Комплекс ЛФК";
  }
  if (lo === "content_section") {
    if (id === "warmups") return "Разминки";
    if (id) {
      const sec = await deps.contentSections.getBySlug(id);
      return sec?.title ?? id;
    }
    return "Раздел";
  }
  if (lo === "content_page") {
    if (id) {
      const p = await deps.contentPages.getBySlug(id);
      return p?.title ?? id;
    }
    return "Страница";
  }
  if (lo === "custom") {
    return rule.customTitle?.trim() || "Своё напоминание";
  }
  return "Напоминание";
}

export default async function PatientHomePage() {
  const [session, platformEntry] = await Promise.all([
    getOptionalPatientSession(),
    getPlatformEntry(),
  ]);

  const dataGate = await patientRscPersonalDataGate(session, routePaths.patient);
  const personalDataOk = dataGate === "allow";

  const blocks = new Set<HomeBlockId>(patientHomeBlocksForEntry(platformEntry));

  const deps = buildAppDeps();
  const canViewAuthSections =
    session?.user != null ? await resolvePatientCanViewAuthOnlyContent(session) : false;
  let contentSections: Awaited<ReturnType<typeof deps.contentSections.listVisible>> = [];
  try {
    contentSections = await deps.contentSections.listVisible({ viewAuthOnlySections: canViewAuthSections });
  } catch (err) {
    logServerRuntimeError("app/patient/home", err);
  }
  const emailFields =
    personalDataOk && session?.user != null
      ? await deps.userProjection.getProfileEmailFields(session.user.userId)
      : null;

  const channelCards =
    personalDataOk && session?.user != null && blocks.has("channels")
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
    personalDataOk && blocks.has("mailings") && session?.user
      ? listRecentMailingLogsForPlatformUser(session.user.userId)
      : Promise.resolve([]),
    blocks.has("motivation")
      ? getQuoteForDay(session?.user?.userId ?? "guest")
      : Promise.resolve(null),
  ]);

  if (personalDataOk && session?.user && homeNews) {
    void incrementNewsViews(homeNews.id, session.user.userId);
  }

  const miniAppPatientHome =
    platformEntry === "bot" &&
    session?.user != null &&
    canViewAuthSections;

  const showPrimaryToday = blocks.has("cabinet") || blocks.has("materials");

  let patientHomeSecondary: ReactNode = null;
  if (showPrimaryToday) {
    try {
      const appTz = await getAppDisplayTimeZone();
      const [emergencyTopics, courseCatalog] = await Promise.all([
        listEmergencyTopics(deps.contentPages),
        deps.courses.listPublishedCatalog(),
      ]);

      let todaySessions: { completedAt: string }[] = [];
      let streakSessions: { completedAt: string }[] = [];
      let rules: ReminderRule[] = [];
      let programs: TreatmentProgramInstanceSummary[] = [];
      let complexes: { id: string; title: string | null }[] = [];

      if (personalDataOk && session?.user) {
        const uid = session.user.userId;
        const dayStart = DateTime.now().setZone(appTz).startOf("day");
        const dayEndExcl = dayStart.plus({ days: 1 });
        const streakFrom = dayStart.minus({ days: 90 });
        [rules, programs, complexes, todaySessions, streakSessions] = await Promise.all([
          deps.reminders.listRulesByUser(uid),
          deps.treatmentProgramInstance.listForPatient(uid),
          deps.diaries.listLfkComplexes(uid),
          deps.diaries.listLfkSessionsInRange({
            userId: uid,
            fromCompletedAt: dayStart.toUTC().toISO()!,
            toCompletedAtExclusive: dayEndExcl.toUTC().toISO()!,
            limit: 200,
          }),
          deps.diaries.listLfkSessionsInRange({
            userId: uid,
            fromCompletedAt: streakFrom.toUTC().toISO()!,
            toCompletedAtExclusive: dayEndExcl.toUTC().toISO()!,
            limit: 5000,
          }),
        ]);
      }

      const streak = personalDataOk && session?.user ? lfkStreakDays(streakSessions, appTz) : 0;
      const progressCount = personalDataOk && session?.user ? todaySessions.length : 0;

      const personalRules = rules
        .filter((r) => r.linkedObjectType != null && r.enabled)
        .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));

      let reminderBlock: ReactNode = null;
      if (personalRules[0]) {
        const r = personalRules[0]!;
        const complexTitleById = Object.fromEntries(complexes.map((c) => [c.id, c.title?.trim() || "—"]));
        const label = await resolvePatientHomeReminderLabel(deps, r, complexTitleById);
        reminderBlock = (
          <PatientHomeNextReminderCard
            ruleLabel={label}
            scheduleLabel={formatReminderScheduleLabel(r)}
            remindersHref={routePaths.patientReminders}
          />
        );
      }

      const sosTopic = emergencyTopics[0] ?? null;
      let sosImage: string | null = null;
      if (sosTopic) {
        try {
          const pageRow = await deps.contentPages.getBySlug(sosTopic.id);
          sosImage = pageRow?.imageUrl ?? null;
        } catch {
          sosImage = null;
        }
      }

      const sosHref = sosTopic
        ? `/app/patient/content/${encodeURIComponent(sosTopic.id)}`
        : routePaths.emergency;

      const activePlan = programs.find((p) => p.status === "active") ?? null;

      const subscriptionItems: PatientHomeSubscriptionItem[] = [
        {
          id: "exercise_reminders",
          title: "Напоминания об упражнениях",
          subtitle: "Включение в разделе уведомлений",
          badgeLabel: "Тема",
          href: `${routePaths.notifications}#sub-exercise_reminders`,
          imageUrl: null,
        },
        {
          id: "symptom_reminders",
          title: "Напоминания о симптомах",
          subtitle: "Включение в разделе уведомлений",
          badgeLabel: "Тема",
          href: `${routePaths.notifications}#sub-symptom_reminders`,
          imageUrl: null,
        },
        {
          id: "appointment_reminders",
          title: "Напоминания о записях",
          subtitle: "Включение в разделе уведомлений",
          badgeLabel: "Тема",
          href: `${routePaths.notifications}#sub-appointment_reminders`,
          imageUrl: null,
        },
        {
          id: "news",
          title: "Новости и обновления",
          subtitle: "Включение в разделе уведомлений",
          badgeLabel: "Тема",
          href: `${routePaths.notifications}#sub-news`,
          imageUrl: null,
        },
      ];

      const courseItems: PatientHomeCourseRowItem[] = courseCatalog.slice(0, 5).map((c) => ({
        id: c.id,
        title: c.title,
        subtitle: c.description,
        href: c.introContentSlug
          ? `/app/patient/content/${encodeURIComponent(c.introContentSlug)}`
          : routePaths.patientCourses,
      }));

      patientHomeSecondary = (
        <section id="patient-home-secondary" className="flex flex-col gap-4">
          <PatientHomeProgressBlock
            practiceTarget={PATIENT_HOME_DAILY_PRACTICE_TARGET}
            progress={progressCount}
            streakDays={streak}
            guestMode={!personalDataOk || session?.user == null}
          />
          {reminderBlock}
          <PatientHomeMoodCheckin disabled={!personalDataOk || session?.user == null} />
          {sosTopic ? (
            <PatientHomeSosCard
              title="Если болит сейчас"
              description={sosTopic.summary}
              href={sosHref}
              buttonLabel="Скорая помощь"
              imageUrl={sosImage}
            />
          ) : null}
          {activePlan ? (
            <PatientHomePlanCard
              instanceId={activePlan.id}
              title={activePlan.title}
              metaLine="Программа лечения"
              progressPercent={null}
            />
          ) : null}
          <PatientHomeSubscriptionCarousel items={subscriptionItems} />
          {courseItems.length > 0 ? <PatientHomeCoursesRow items={courseItems} /> : null}
        </section>
      );
    } catch (err) {
      logServerRuntimeError("app/patient/home-secondary", err);
    }
  }

  if (miniAppPatientHome) {
    return (
      <AppShell title="Главное меню" user={session.user} variant="patient">
        <PatientMiniAppPatientHome platformUserId={session.user.userId} />
      </AppShell>
    );
  }

  return (
    <AppShell title="Главное меню" user={session?.user ?? null} variant="patient">
      <div className="flex flex-col gap-8">
        {showPrimaryToday ? (
          <PatientHomeToday
            personalTierOk={personalDataOk}
            sessionUser={session?.user ?? null}
            contentSections={contentSections}
            showBooking={blocks.has("cabinet")}
            showMaterials={blocks.has("materials")}
          />
        ) : null}
        {patientHomeSecondary}
        {blocks.has("materials") && !showPrimaryToday ? (
          <PatientHomeLessonsSection sections={contentSections} />
        ) : null}
        <PatientHomeExtraBlocks blocks={blocks} />
        {blocks.has("news") ? (
          <PatientHomeNewsSection news={homeNews} banner={banner} />
        ) : null}
        {personalDataOk && blocks.has("mailings") && session?.user && mailings.length > 0 ? (
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
        <LegalFooterLinks className="mt-4 pb-2" />
      </div>
    </AppShell>
  );
}
