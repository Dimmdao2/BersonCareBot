import { Fragment } from "react";
import type { AppSession } from "@/shared/types/session";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { getPatientHomeTodayConfig } from "@/modules/patient-home/todayConfig";
import { filterAndSortPatientHomeBlocks } from "@/modules/patient-home/patientHomeBlockPolicy";
import {
  pickNextReminderRuleForHome,
} from "@/modules/patient-home/patientHomeReminderPick";
import {
  resolveCourseRowCards,
  resolveSituationChips,
  resolveSosCard,
  resolveSubscriptionCarouselCards,
} from "@/modules/patient-home/patientHomeResolvers";
import type { PatientHomeBlockCode } from "@/modules/patient-home/ports";
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

type Props = {
  session: AppSession;
  personalTierOk: boolean;
  canViewAuthOnlyContent: boolean;
};

export async function PatientHomeToday({ session, personalTierOk, canViewAuthOnlyContent }: Props) {
  const deps = buildAppDeps();

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

  const [situationChips, subscriptionCards, sosCard, courseCards] = await Promise.all([
    situationsBlock ? resolveSituationChips(situationsBlock.items, resolverDeps, canViewAuthOnlyContent) : Promise.resolve([]),
    subscriptionBlock ?
      resolveSubscriptionCarouselCards(subscriptionBlock.items, resolverDeps, canViewAuthOnlyContent)
    : Promise.resolve([]),
    sosBlock ? resolveSosCard(sosBlock.items, resolverDeps, canViewAuthOnlyContent) : Promise.resolve(null),
    coursesBlock ? resolveCourseRowCards(coursesBlock.items, resolverDeps) : Promise.resolve([]),
  ]);

  let reminderRule = null;
  let planInstance: { id: string; title: string } | null = null;
  if (personalTierOk) {
    const [rules, instances] = await Promise.all([
      deps.reminders.listRulesByUser(session.user.userId),
      deps.treatmentProgramInstance.listForPatient(session.user.userId),
    ]);
    reminderRule = pickNextReminderRuleForHome(rules);
    const active = instances
      .filter((i) => i.status === "active")
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    planInstance = active[0] ? { id: active[0].id, title: active[0].title } : null;
  }

  const sorted = filterAndSortPatientHomeBlocks(homeBlocks, personalTierOk);

  const personalizedName = personalTierOk ? session.user.displayName?.trim() || null : null;

  const renderBlock = (code: PatientHomeBlockCode) => {
    switch (code) {
      case "daily_warmup":
        return (
          <PatientHomeDailyWarmupCard warmup={todayCfg.dailyWarmupItem} personalTierOk={personalTierOk} />
        );
      case "booking":
        return <PatientHomeBookingCard personalTierOk={personalTierOk} />;
      case "situations":
        return <PatientHomeSituationsRow chips={situationChips} />;
      case "progress":
        return (
          <PatientHomeProgressBlock
            practiceTarget={todayCfg.practiceTarget}
            personalTierOk={personalTierOk}
          />
        );
      case "next_reminder":
        return <PatientHomeNextReminderCard rule={reminderRule} />;
      case "mood_checkin":
        return <PatientHomeMoodCheckin personalTierOk={personalTierOk} />;
      case "sos":
        return <PatientHomeSosCard sos={sosCard} />;
      case "plan":
        return <PatientHomePlanCard instance={planInstance} />;
      case "subscription_carousel":
        return <PatientHomeSubscriptionCarousel cards={subscriptionCards} />;
      case "courses":
        return <PatientHomeCoursesRow cards={courseCards} />;
      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col gap-6 pb-6">
      <PatientHomeGreeting personalizedName={personalizedName} />
      {sorted.map((b) => (
        <Fragment key={b.code}>{renderBlock(b.code)}</Fragment>
      ))}
    </div>
  );
}
