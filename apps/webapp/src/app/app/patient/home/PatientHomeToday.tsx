import type { ReactNode } from "react";
import type { AppSession } from "@/shared/types/session";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { getPatientHomeTodayConfig } from "@/modules/patient-home/todayConfig";
import { formatPatientHomeWarmupCooldownCaption } from "@/modules/patient-home/dailyWarmupHeroCooldown";
import {
  parsePatientHomeDailyWarmupRepeatCooldownMinutes,
  parsePatientHomeWarmupSkipToNextAvailableEnabled,
} from "@/modules/patient-home/patientHomeRepeatCooldownSettings";
import { filterAndSortPatientHomeBlocks } from "@/modules/patient-home/patientHomeBlockPolicy";
import type { ReminderRule } from "@/modules/reminders/types";
import {
  formatPatientHomeNextReminderHeadline,
  formatReminderMuteRemainingRu,
  hasConfiguredHomeLinkedReminders,
  pickNextHomeReminder,
  reminderScheduleEvaluationInstant,
  countPlannedHomeReminderOccurrencesInUtcRange,
} from "@/modules/patient-home/nextReminderOccurrence";
import { pickActivePlanInstance } from "@/modules/treatment-program/pickActivePlanInstance";
import { formatBookingDateLongRu } from "@/shared/lib/formatBusinessDateTime";
import type { PatientHomeBlockCode } from "@/modules/patient-home/ports";
import type { PatientMoodCheckinState, PatientMoodWeekDay } from "@/modules/patient-mood/types";
import type {
  ResolvedCarouselCard,
  ResolvedCourseCard,
  ResolvedSituationChip,
  ResolvedSosCard,
  ResolvedUsefulPostCard,
} from "@/modules/patient-home/patientHomeResolvers";
import {
  resolveCourseRowCards,
  resolveSituationChips,
  resolveSosCard,
  resolveSubscriptionCarouselCards,
  resolveUsefulPostCard,
} from "@/modules/patient-home/patientHomeResolvers";
import { greetingPrefixFromHour } from "./PatientHomeGreeting";
import { PatientHomeDailyWarmupCard } from "./PatientHomeDailyWarmupCard";
import { PatientHomeSituationsRow } from "./PatientHomeSituationsRow";
import { PatientHomeProgressBlock } from "./PatientHomeProgressBlock";
import { PatientHomeNextReminderCard } from "./PatientHomeNextReminderCard";
import { PatientHomeMoodCheckin } from "./PatientHomeMoodCheckin";
import { PatientHomeSosBookingSplitCard } from "./PatientHomeSosBookingSplitCard";
import { PatientHomePlanCard } from "./PatientHomePlanCard";
import { PatientHomeSubscriptionCarousel } from "./PatientHomeSubscriptionCarousel";
import { PatientHomeCoursesRow } from "./PatientHomeCoursesRow";
import { PatientHomeTodayLayout } from "./PatientHomeTodayLayout";
import {
  insertProgressThenSosBookingSplitAfterMood,
  moveNextReminderAfterProgress,
  reorderPatientHomeLayoutBlocks,
} from "./patientHomeTodayLayoutOrder";
import { PatientHomeUsefulPostCard } from "./PatientHomeUsefulPostCard";
import { PatientHomeBookingCard } from "./PatientHomeBookingCard";
import { PatientHomeSosCard } from "./PatientHomeSosCard";
import { hrefForPatientHomeDrilldown, stripApiMediaForAnonymousGuest } from "./patientHomeGuestNav";
import { getAppDisplayTimeZone } from "@/modules/system-settings/appDisplayTimezone";
import { DateTime } from "luxon";
import { parsePatientHomeMoodIcons } from "@/modules/patient-home/patientHomeMoodIcons";
import type { ChecklistTodaySnapshot } from "@/modules/treatment-program/patient-program-actions";
import { computePracticeStreak } from "@/modules/patient-practice/streakLogic";
import {
  omitDisabledInstanceStageItemsForPatientApi,
  resolvePatientProgramProgressDaysForPatientUi,
} from "@/modules/treatment-program/stage-semantics";
import { resolveCalendarDayIanaForPatient } from "@/modules/system-settings/calendarIana";
import { routePaths } from "@/app-layer/routes/paths";
import { resolveFirstPendingProgramTabItemId } from "./resolveFirstPendingProgramTabItemId";

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

function mapUsefulPostForGuest(post: ResolvedUsefulPostCard | null, anonymousGuest: boolean): ResolvedUsefulPostCard | null {
  if (!post || !anonymousGuest) return post;
  return {
    ...post,
    href: hrefForPatientHomeDrilldown(post.href, true),
    imageUrl: stripApiMediaForAnonymousGuest(post.imageUrl, true),
  };
}

export async function PatientHomeToday({ session, personalTierOk, canViewAuthOnlyContent }: Props) {
  const deps = buildAppDeps();
  const anonymousGuest = session === null;

  let appTz = await getAppDisplayTimeZone();
  const weekdayMonday0 = DateTime.now().setZone(appTz).weekday - 1;

  const [homeBlocks, moodSetting, warmupRepeatSetting, warmupSkipSetting] = await Promise.all([
    deps.patientHomeBlocks.listBlocksWithItems(),
    deps.systemSettings.getSetting("patient_home_mood_icons", "admin"),
    deps.systemSettings.getSetting("patient_home_daily_warmup_repeat_cooldown_minutes", "admin"),
    deps.systemSettings.getSetting("patient_home_warmup_skip_to_next_available_enabled", "admin"),
  ]);

  const dailyWarmupRepeatCooldownMinutes = parsePatientHomeDailyWarmupRepeatCooldownMinutes(
    warmupRepeatSetting?.valueJson ?? null,
  );
  const warmupSkipCooldownPages = parsePatientHomeWarmupSkipToNextAvailableEnabled(
    warmupSkipSetting?.valueJson ?? null,
  );

  const warmupPick =
    session && personalTierOk ?
      {
        userId: session.user.userId,
        getDailyWarmupHeroCooldownMeta: deps.patientPractice.getDailyWarmupHeroCooldownMeta.bind(deps.patientPractice),
        cooldownMinutes: dailyWarmupRepeatCooldownMinutes,
        skipCooldownPages: warmupSkipCooldownPages,
      }
    : undefined;

  const todayCfg = await getPatientHomeTodayConfig(
    {
      patientHomeBlocks: deps.patientHomeBlocks,
      contentPages: deps.contentPages,
      contentSections: deps.contentSections,
      systemSettings: deps.systemSettings,
    },
    weekdayMonday0,
    warmupPick,
  );
  const moodIconOptions = parsePatientHomeMoodIcons(moodSetting?.valueJson ?? null);

  const resolverDeps = {
    contentSections: deps.contentSections,
    contentPages: deps.contentPages,
    courses: deps.courses,
  };

  const situationsBlock = homeBlocks.find((b) => b.code === "situations");
  const subscriptionBlock = homeBlocks.find((b) => b.code === "subscription_carousel");
  const sosBlock = homeBlocks.find((b) => b.code === "sos");
  const coursesBlock = homeBlocks.find((b) => b.code === "courses");
  const usefulPostBlock = homeBlocks.find((b) => b.code === "useful_post");

  const [situationChipsRaw, subscriptionCardsRaw, sosCardRaw, courseCardsRaw, usefulPostRaw] = await Promise.all([
    situationsBlock ? resolveSituationChips(situationsBlock.items, resolverDeps, canViewAuthOnlyContent) : Promise.resolve([]),
    subscriptionBlock ?
      resolveSubscriptionCarouselCards(subscriptionBlock.items, resolverDeps, canViewAuthOnlyContent)
    : Promise.resolve([]),
    sosBlock ? resolveSosCard(sosBlock.items, resolverDeps, canViewAuthOnlyContent) : Promise.resolve(null),
    coursesBlock ? resolveCourseRowCards(coursesBlock.items, resolverDeps) : Promise.resolve([]),
    usefulPostBlock ?
      resolveUsefulPostCard(usefulPostBlock.items, resolverDeps, canViewAuthOnlyContent)
    : Promise.resolve(null),
  ]);

  const situationChips = mapSituationChipsForGuest(situationChipsRaw, anonymousGuest);
  const subscriptionCards = mapCarouselForGuest(subscriptionCardsRaw, anonymousGuest);
  const sosCard = mapSosForGuest(sosCardRaw, anonymousGuest);
  const courseCards = mapCourseCardsForGuest(courseCardsRaw, anonymousGuest);
  const usefulPost = mapUsefulPostForGuest(usefulPostRaw, anonymousGuest);

  let homeReminder: { rule: ReminderRule; nextAt: Date } | null = null;
  let planInstance: { id: string; title: string } | null = null;
  let planProgressDay: number | null = null;
  let planTodayPracticeDone = false;
  let planUpdatedLabel: string | null = null;
  let planStartLessonHref: string | null = null;
  let progress: { todayDone: number; streak: number } | null = null;
  let initialMoodCheckin: PatientMoodCheckinState | null = null;
  let moodWeekDays: PatientMoodWeekDay[] = [];
  let hasConfiguredSchedule = false;
  let reminderDaySummary: {
    done: number;
    plannedTotal: number;
    muted: boolean;
    muteRemainingLabel: string | null;
    hasConfiguredSchedule: boolean;
  } | null = null;
  let practiceTarget = todayCfg.practiceTarget;
  /** Единый «сейчас» для заголовка и mute; pick учитывает глобальную заглушку. */
  let patientHomeReminderEvaluatedAt: Date | null = null;
  let moodWeekTz = appTz;
  let dailyWarmupHeroCooldownActive = false;
  let warmupCooldownCaption: string | null = null;

  if (session) {
    const p = await deps.patientPractice.getProgress(session.user.userId, appTz, todayCfg.practiceTarget);
    progress = { todayDone: p.todayDone, streak: p.streak };
  }

  if (personalTierOk && session) {
    const warmupPageId = todayCfg.dailyWarmupItem?.page?.contentPageId;
    const [rules, instances, moodState, mutedUntilIso, patientCalTz, warmupCooldownMeta, recentPracticeRows, lfkRecentDays] =
      await Promise.all([
      deps.reminders.listRulesByUser(session.user.userId),
      deps.treatmentProgramInstance.listForPatient(session.user.userId),
      deps.patientMood.getCheckinState(session.user.userId, appTz),
      deps.reminders.getReminderMutedUntil(session.user.userId),
      deps.patientCalendarTimezone.getIanaForUser(session.user.userId),
      warmupPageId ?
        deps.patientPractice.getDailyWarmupHeroCooldownMeta(
          session.user.userId,
          warmupPageId,
          dailyWarmupRepeatCooldownMinutes,
        )
      : Promise.resolve({ active: false as const }),
      deps.patientPractice.listRecent(session.user.userId, 1500),
      deps.treatmentProgramPatientActions.listLocalDoneDateKeysForRecentDays(session.user.userId, 120),
    ]);
    if (progress) {
      const mergedDates = new Set<string>();
      for (const row of recentPracticeRows) {
        const d = DateTime.fromISO(row.completedAt, { setZone: true }).setZone(lfkRecentDays.iana).toISODate();
        if (d) mergedDates.add(d);
      }
      for (const key of lfkRecentDays.dateKeys) {
        const normalized = key.trim();
        if (normalized) mergedDates.add(normalized);
      }
      const mergedStreak = computePracticeStreak(mergedDates, lfkRecentDays.iana);
      progress = { ...progress, streak: Math.max(progress.streak, mergedStreak) };
    }
    if (warmupCooldownMeta.active) {
      dailyWarmupHeroCooldownActive = true;
      warmupCooldownCaption = formatPatientHomeWarmupCooldownCaption(warmupCooldownMeta.minutesRemaining);
    } else if (
      todayCfg.allDailyWarmupsInCooldown &&
      todayCfg.allDailyWarmupsCooldownMinutesRemaining != null
    ) {
      dailyWarmupHeroCooldownActive = true;
      warmupCooldownCaption = formatPatientHomeWarmupCooldownCaption(
        todayCfg.allDailyWarmupsCooldownMinutesRemaining,
      );
    }
    moodWeekTz = resolveCalendarDayIanaForPatient(patientCalTz, appTz);
    const week = await deps.patientMood.getWeekSparkline(session.user.userId, moodWeekTz);
    patientHomeReminderEvaluatedAt = new Date();
    const scheduleInstant = reminderScheduleEvaluationInstant(patientHomeReminderEvaluatedAt, mutedUntilIso);
    hasConfiguredSchedule = hasConfiguredHomeLinkedReminders(rules);
    homeReminder = pickNextHomeReminder(rules, scheduleInstant, appTz);
    const dayStart = DateTime.now().setZone(appTz).startOf("day");
    const dayEnd = dayStart.plus({ days: 1 });
    const rangeStart = dayStart.toUTC().toJSDate();
    const rangeEnd = dayEnd.toUTC().toJSDate();
    const compareNow = patientHomeReminderEvaluatedAt ?? new Date();
    const muted = !!(mutedUntilIso && new Date(mutedUntilIso).getTime() > compareNow.getTime());
    const plannedTotal = muted ? 0 : countPlannedHomeReminderOccurrencesInUtcRange(rules, rangeStart, rangeEnd);
    if (hasConfiguredSchedule) {
      practiceTarget = plannedTotal;
    }
    const picked = pickActivePlanInstance(instances);
    planInstance = picked ? { id: picked.id, title: picked.title } : null;
    if (planInstance) {
      planStartLessonHref = routePaths.patientTreatmentProgram(planInstance.id);
      const [nudge, rawDetail, snap] = await Promise.all([
        deps.treatmentProgramInstance.patientPlanUpdatedBadgeForInstance({
          patientUserId: session.user.userId,
          instanceId: planInstance.id,
        }),
        deps.treatmentProgramInstance.getInstanceForPatient(session.user.userId, planInstance.id),
        deps.treatmentProgramPatientActions.listChecklistDoneToday(
          session.user.userId,
          planInstance.id,
        ),
      ]);
      planTodayPracticeDone = checklistHadAnyCompletionToday(snap);
      if (nudge.show) {
        planUpdatedLabel = nudge.eventIso
          ? `План обновлён ${formatBookingDateLongRu(nudge.eventIso, appTz)}`
          : "План обновлён";
      }
      if (rawDetail) {
        const detail = omitDisabledInstanceStageItemsForPatientApi(rawDetail);
        const patientIana = await deps.patientCalendarTimezone.getIanaForUser(session.user.userId);
        const resolvedIana = resolveCalendarDayIanaForPatient(patientIana, appTz);
        planProgressDay = resolvePatientProgramProgressDaysForPatientUi(detail, DateTime.now(), resolvedIana, appTz);
        const firstItemId = resolveFirstPendingProgramTabItemId(detail, snap.doneItemIds);
        if (firstItemId) {
          planStartLessonHref = routePaths.patientTreatmentProgramItem(
            planInstance.id,
            firstItemId,
            "exec",
            "program",
          );
        }
      }
    }
    initialMoodCheckin = moodState;
    moodWeekDays = week;
    if (deps.reminderJournal) {
      const muteRemainingLabel =
        muted && mutedUntilIso?.trim() ? formatReminderMuteRemainingRu(mutedUntilIso.trim(), compareNow) : null;
      const done = await deps.reminderJournal.countDoneSkippedInUtcRange(
        session.user.userId,
        rangeStart,
        rangeEnd,
      );
      reminderDaySummary = { done, plannedTotal, muted, muteRemainingLabel, hasConfiguredSchedule };
    }
  }

  const sorted = filterAndSortPatientHomeBlocks(homeBlocks);
  if (progress && planTodayPracticeDone) {
    progress = {
      todayDone: Math.max(progress.todayDone, 1),
      streak: Math.max(progress.streak, 1),
    };
  }

  const nextReminderScheduleLabel = homeReminder
    ? formatPatientHomeNextReminderHeadline(
        homeReminder.nextAt,
        patientHomeReminderEvaluatedAt ?? new Date(),
        appTz,
      )
    : hasConfiguredSchedule
      ? "Ближайших напоминаний нет"
      : "Напоминания не настроены";

  const personalizedName = personalTierOk && session ? session.user.displayName?.trim() || null : null;
  const timeOfDayPrefix = greetingPrefixFromHour(DateTime.now().setZone(appTz).hour);

  const blockLeadingIconFor = (code: PatientHomeBlockCode) =>
    stripApiMediaForAnonymousGuest(homeBlocks.find((b) => b.code === code)?.iconImageUrl ?? null, anonymousGuest);

  const renderBlock = (code: PatientHomeBlockCode): ReactNode => {
    switch (code) {
      case "daily_warmup":
        return (
          <PatientHomeDailyWarmupCard
            warmup={todayCfg.dailyWarmupItem}
            personalTierOk={personalTierOk}
            anonymousGuest={anonymousGuest}
            warmupRecentlyCompletedHero={dailyWarmupHeroCooldownActive}
            warmupCooldownCaption={warmupCooldownCaption}
            allDailyWarmupsInCooldown={todayCfg.allDailyWarmupsInCooldown}
          />
        );
      case "useful_post":
        if (!usefulPost) return null;
        return <PatientHomeUsefulPostCard post={usefulPost} />;
      case "booking":
        return (
          <PatientHomeBookingCard
            personalTierOk={personalTierOk}
            anonymousGuest={anonymousGuest}
            blockIconImageUrl={blockLeadingIconFor("booking")}
          />
        );
      case "situations":
        if (situationChips.length === 0) return null;
        return <PatientHomeSituationsRow chips={situationChips} />;
      case "progress":
        return (
          <PatientHomeProgressBlock
            practiceTarget={practiceTarget}
            anonymousGuest={anonymousGuest}
            progress={progress}
            blockIconImageUrl={blockLeadingIconFor("progress")}
          />
        );
      case "next_reminder":
        return (
          <PatientHomeNextReminderCard
            rule={homeReminder?.rule ?? null}
            scheduleLabel={nextReminderScheduleLabel}
            blockIconImageUrl={blockLeadingIconFor("next_reminder")}
            anonymousGuest={anonymousGuest}
            personalTierOk={personalTierOk}
            reminderDaySummary={reminderDaySummary}
          />
        );
      case "mood_checkin":
        return (
          <PatientHomeMoodCheckin
            moodOptions={moodIconOptions}
            personalTierOk={personalTierOk}
            anonymousGuest={anonymousGuest}
            initialMood={initialMoodCheckin?.mood ?? null}
            initialLastEntry={initialMoodCheckin?.lastEntry ?? null}
            moodWeekDays={moodWeekDays}
            wellbeingWeekTimeZone={moodWeekTz}
          />
        );
      case "sos":
        if (!sosCard) return null;
        return <PatientHomeSosCard sos={sosCard} blockIconImageUrl={blockLeadingIconFor("sos")} />;
      case "plan":
        if (!planInstance) return null;
        return (
          <PatientHomePlanCard
            instance={planInstance}
            startLessonHref={planStartLessonHref ?? routePaths.patientTreatmentProgram(planInstance.id)}
            progressDay={planProgressDay}
            todayPracticeDone={planTodayPracticeDone}
            planUpdatedLabel={planUpdatedLabel}
            blockIconImageUrl={blockLeadingIconFor("plan")}
          />
        );
      case "subscription_carousel":
        if (subscriptionCards.length === 0) return null;
        return (
          <PatientHomeSubscriptionCarousel
            cards={subscriptionCards}
            sectionTitle={subscriptionBlock?.title?.trim() || undefined}
          />
        );
      case "courses":
        return (
          <PatientHomeCoursesRow
            cards={courseCards}
            anonymousGuest={anonymousGuest}
            personalTierOk={personalTierOk}
          />
        );
      default:
        return null;
    }
  };

  const hasBookingBlock = sorted.some((b) => b.code === "booking");
  const hasSosBlock = sorted.some((b) => b.code === "sos");
  const mergedStripHasContent = hasBookingBlock || (hasSosBlock && sosCard !== null);

  const sortedForRender =
    mergedStripHasContent ? sorted.filter((b) => b.code !== "sos" && b.code !== "booking") : sorted;

  let layoutBlocks = reorderPatientHomeLayoutBlocks(
    sortedForRender
      .map((block) => ({ code: block.code, node: renderBlock(block.code) }))
      .filter((block): block is { code: PatientHomeBlockCode; node: Exclude<ReactNode, null | undefined | false> } =>
        block.node !== null && block.node !== undefined && block.node !== false,
      ),
  );

  layoutBlocks = insertProgressThenSosBookingSplitAfterMood(
    layoutBlocks,
    mergedStripHasContent ?
      {
        code: "sos_booking_split",
        node: (
          <PatientHomeSosBookingSplitCard
            sos={sosCard}
            showSosHalf={Boolean(hasSosBlock && sosCard)}
            showBookingHalf={hasBookingBlock}
            personalTierOk={personalTierOk}
            anonymousGuest={anonymousGuest}
            sosIconUrl={blockLeadingIconFor("sos")}
            bookingIconUrl={blockLeadingIconFor("booking")}
          />
        ),
      }
    : null,
  );

  layoutBlocks = moveNextReminderAfterProgress(layoutBlocks);

  return (
    <PatientHomeTodayLayout personalizedName={personalizedName} timeOfDayPrefix={timeOfDayPrefix} blocks={layoutBlocks} />
  );
}

function checklistHadAnyCompletionToday(snap: ChecklistTodaySnapshot): boolean {
  if (snap.doneItemIds.length > 0) return true;
  if (Object.values(snap.doneTodayCountByItemId).some((n) => n > 0)) return true;
  if (Object.values(snap.doneTodayCountByActivityKey).some((n) => n > 0)) return true;
  return false;
}
