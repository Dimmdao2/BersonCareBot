import type { ReactNode } from "react";
import type { AppSession } from "@/shared/types/session";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { getPatientHomeTodayConfig } from "@/modules/patient-home/todayConfig";
import { filterAndSortPatientHomeBlocks } from "@/modules/patient-home/patientHomeBlockPolicy";
import type { ReminderRule } from "@/modules/reminders/types";
import {
  formatNextReminderLabel,
  pickNextHomeReminder,
} from "@/modules/patient-home/nextReminderOccurrence";
import type { PatientHomeBlockCode } from "@/modules/patient-home/ports";
import type { PatientMoodToday } from "@/modules/patient-mood/types";
import type {
  ResolvedCarouselCard,
  ResolvedCourseCard,
  ResolvedSituationChip,
  ResolvedSosCard,
} from "@/modules/patient-home/patientHomeResolvers";
import {
  resolveCourseRowCards,
  resolveSituationChips,
  resolveSosCard,
  resolveSubscriptionCarouselCards,
} from "@/modules/patient-home/patientHomeResolvers";
import { PatientHomeGreeting } from "./PatientHomeGreeting";
import { PatientHomeDailyWarmupCard } from "./PatientHomeDailyWarmupCard";
import { PatientHomeBookingCard } from "./PatientHomeBookingCard";
import { PatientHomeSituationsRow } from "./PatientHomeSituationsRow";
import { PatientHomeProgressBlock } from "./PatientHomeProgressBlock";
import { PatientHomeNextReminderCard } from "./PatientHomeNextReminderCard";
import { PatientHomeMoodCheckin } from "./PatientHomeMoodCheckin";
import { PatientHomeSosCard } from "./PatientHomeSosCard";
import { PatientHomePlanCard } from "./PatientHomePlanCard";
import { PatientHomeSubscriptionCarousel } from "./PatientHomeSubscriptionCarousel";
import { PatientHomeCoursesRow } from "./PatientHomeCoursesRow";
import { PatientHomeTodayLayout } from "./PatientHomeTodayLayout";
import { hrefForPatientHomeDrilldown, stripApiMediaForAnonymousGuest } from "./patientHomeGuestNav";
import { getAppDisplayTimeZone } from "@/modules/system-settings/appDisplayTimezone";

type Props = {
  session: AppSession | null;
  personalTierOk: boolean;
  canViewAuthOnlyContent: boolean;
};

function mapSituationChipsForGuest(chips: ResolvedSituationChip[], anonymousGuest: boolean): ResolvedSituationChip[] {
  if (!anonymousGuest) return chips;
  return chips.map((c) => ({
    ...c,
    href: hrefForPatientHomeDrilldown(c.href, true),
    imageUrl: stripApiMediaForAnonymousGuest(c.imageUrl, true),
  }));
}

function mapCarouselForGuest(cards: ResolvedCarouselCard[], anonymousGuest: boolean): ResolvedCarouselCard[] {
  if (!anonymousGuest) return cards;
  return cards.map((c) => ({
    ...c,
    href: hrefForPatientHomeDrilldown(c.href, true),
    imageUrl: stripApiMediaForAnonymousGuest(c.imageUrl, true),
  }));
}

function mapSosForGuest(sos: ResolvedSosCard | null, anonymousGuest: boolean): ResolvedSosCard | null {
  if (!sos || !anonymousGuest) return sos;
  return {
    ...sos,
    href: hrefForPatientHomeDrilldown(sos.href, true),
    imageUrl: stripApiMediaForAnonymousGuest(sos.imageUrl, true),
  };
}

function mapCourseCardsForGuest(cards: ResolvedCourseCard[], anonymousGuest: boolean): ResolvedCourseCard[] {
  if (!anonymousGuest) return cards;
  return cards.map((c) => ({ ...c, href: hrefForPatientHomeDrilldown(c.href, true) }));
}

export async function PatientHomeToday({ session, personalTierOk, canViewAuthOnlyContent }: Props) {
  const deps = buildAppDeps();
  const anonymousGuest = session === null;

  const [homeBlocks, todayCfg] = await Promise.all([
    deps.patientHomeBlocks.listBlocksWithItems(),
    getPatientHomeTodayConfig({
      patientHomeBlocks: deps.patientHomeBlocks,
      contentPages: deps.contentPages,
      systemSettings: deps.systemSettings,
    }),
  ]);

  const resolverDeps = {
    contentSections: deps.contentSections,
    contentPages: deps.contentPages,
    courses: deps.courses,
  };

  const situationsBlock = homeBlocks.find((b) => b.code === "situations");
  const subscriptionBlock = homeBlocks.find((b) => b.code === "subscription_carousel");
  const sosBlock = homeBlocks.find((b) => b.code === "sos");
  const coursesBlock = homeBlocks.find((b) => b.code === "courses");

  const [situationChipsRaw, subscriptionCardsRaw, sosCardRaw, courseCardsRaw] = await Promise.all([
    situationsBlock ? resolveSituationChips(situationsBlock.items, resolverDeps, canViewAuthOnlyContent) : Promise.resolve([]),
    subscriptionBlock ?
      resolveSubscriptionCarouselCards(subscriptionBlock.items, resolverDeps, canViewAuthOnlyContent)
    : Promise.resolve([]),
    sosBlock ? resolveSosCard(sosBlock.items, resolverDeps, canViewAuthOnlyContent) : Promise.resolve(null),
    coursesBlock ? resolveCourseRowCards(coursesBlock.items, resolverDeps) : Promise.resolve([]),
  ]);

  const situationChips = mapSituationChipsForGuest(situationChipsRaw, anonymousGuest);
  const subscriptionCards = mapCarouselForGuest(subscriptionCardsRaw, anonymousGuest);
  const sosCard = mapSosForGuest(sosCardRaw, anonymousGuest);
  const courseCards = mapCourseCardsForGuest(courseCardsRaw, anonymousGuest);

  let homeReminder: { rule: ReminderRule; nextAt: Date } | null = null;
  let planInstance: { id: string; title: string } | null = null;
  let progress: { todayDone: number; streak: number } | null = null;
  let initialMood: PatientMoodToday | null = null;
  let appTz = "Europe/Moscow";
  if (personalTierOk && session) {
    appTz = await getAppDisplayTimeZone();
    const [rules, instances, p, mood] = await Promise.all([
      deps.reminders.listRulesByUser(session.user.userId),
      deps.treatmentProgramInstance.listForPatient(session.user.userId),
      deps.patientPractice.getProgress(session.user.userId, appTz, todayCfg.practiceTarget),
      deps.patientMood.getToday(session.user.userId, appTz),
    ]);
    homeReminder = pickNextHomeReminder(rules, new Date(), appTz);
    const active = instances
      .filter((i) => i.status === "active")
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    planInstance = active[0] ? { id: active[0].id, title: active[0].title } : null;
    progress = { todayDone: p.todayDone, streak: p.streak };
    initialMood = mood;
  }

  const sorted = filterAndSortPatientHomeBlocks(homeBlocks, personalTierOk);

  const nextReminderScheduleLabel =
    homeReminder ? formatNextReminderLabel(homeReminder.nextAt, appTz) : "";

  const personalizedName = personalTierOk && session ? session.user.displayName?.trim() || null : null;

  const renderBlock = (code: PatientHomeBlockCode): ReactNode => {
    switch (code) {
      case "daily_warmup":
        return (
          <PatientHomeDailyWarmupCard
            warmup={todayCfg.dailyWarmupItem}
            personalTierOk={personalTierOk}
            anonymousGuest={anonymousGuest}
          />
        );
      case "booking":
        return <PatientHomeBookingCard personalTierOk={personalTierOk} anonymousGuest={anonymousGuest} />;
      case "situations":
        if (situationChips.length === 0) return null;
        return <PatientHomeSituationsRow chips={situationChips} />;
      case "progress":
        return (
          <PatientHomeProgressBlock
            practiceTarget={todayCfg.practiceTarget}
            personalTierOk={personalTierOk}
            anonymousGuest={anonymousGuest}
            progress={progress}
          />
        );
      case "next_reminder":
        if (!homeReminder) return null;
        return (
          <PatientHomeNextReminderCard
            rule={homeReminder.rule}
            scheduleLabel={nextReminderScheduleLabel}
          />
        );
      case "mood_checkin":
        return (
          <PatientHomeMoodCheckin
            personalTierOk={personalTierOk}
            anonymousGuest={anonymousGuest}
            initialMood={initialMood}
          />
        );
      case "sos":
        if (!sosCard) return null;
        return <PatientHomeSosCard sos={sosCard} />;
      case "plan":
        if (!planInstance) return null;
        return <PatientHomePlanCard instance={planInstance} />;
      case "subscription_carousel":
        if (subscriptionCards.length === 0) return null;
        return <PatientHomeSubscriptionCarousel cards={subscriptionCards} />;
      case "courses":
        if (courseCards.length === 0) return null;
        return <PatientHomeCoursesRow cards={courseCards} />;
      default:
        return null;
    }
  };

  const layoutBlocks = sorted
    .map((block) => ({ code: block.code, node: renderBlock(block.code) }))
    .filter((block): block is { code: PatientHomeBlockCode; node: Exclude<ReactNode, null | undefined | false> } =>
      block.node !== null && block.node !== undefined && block.node !== false,
    );

  return (
    <PatientHomeTodayLayout personalizedName={personalizedName} blocks={layoutBlocks} />
  );
}
