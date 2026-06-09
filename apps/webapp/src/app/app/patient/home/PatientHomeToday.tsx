import type { ReactNode } from "react";
import type { AppSession } from "@/shared/types/session";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { buildDailyWarmupPresentationSyncDeps } from "@/modules/patient-home/buildDailyWarmupPresentationSyncDeps";
import { buildPatientHomeWarmupPickContext } from "@/modules/patient-home/buildPatientHomeWarmupPickContext";
import { getPatientHomeTodayConfig } from "@/modules/patient-home/todayConfig";
import { formatPatientHomeWarmupCooldownCaption } from "@/modules/patient-home/dailyWarmupHeroCooldown";
import { shouldActivateDailyWarmupHeroCooldown } from "@/modules/patient-home/dailyWarmupHeroCooldownGate";
import {
  parsePatientHomeDailyWarmupRepeatCooldownMinutes,
} from "@/modules/patient-home/patientHomeRepeatCooldownSettings";
import { filterAndSortPatientHomeBlocks } from "@/modules/patient-home/patientHomeBlockPolicy";
import type { ReminderRule } from "@/modules/reminders/types";
import {
  formatPatientHomeNextReminderHeadline,
  formatReminderMuteRemainingRu,
  hasConfiguredHomeLinkedReminders,
  pickNextHomeReminder,
  reminderScheduleEvaluationInstant,
} from "@/modules/patient-home/nextReminderOccurrence";
import { pickActivePlanInstanceForPatientHome } from "@/modules/treatment-program/pickActivePlanInstance";
import { formatBookingDateLongRu } from "@/shared/lib/formatBusinessDateTime";
import type { PatientHomeBlockCode } from "@/modules/patient-home/ports";
import type { PatientMoodCheckinState, PatientMoodScore, PatientMoodWeekMark } from "@/modules/patient-mood/types";
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
import { patientGreetingPersonalizedName } from "@/modules/patient-home/patientGreetingPersonalizedName";
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
import { resolvePatientHomeBlockLeadingIconUrl } from "@/modules/patient-home/patientHomeStaticIcons";
import type { ChecklistTodaySnapshot } from "@/modules/treatment-program/patient-program-actions";
import {
  omitDisabledInstanceStageItemsForPatientApi,
  resolvePatientProgramProgressDaysForPatientUi,
} from "@/modules/treatment-program/stage-semantics";
import { resolveCalendarDayIanaForPatient } from "@/modules/system-settings/calendarIana";
import { routePaths } from "@/app-layer/routes/paths";
import { HOME_WELLBEING_STRIP_DAY_COUNT } from "./buildPatientHomeWellbeingWeekStripChart";
import { resolveFirstPendingProgramTabItemId } from "./resolveFirstPendingProgramTabItemId";
import { loadPatientHomeProgressMetrics } from "@/modules/patient-home/loadPatientHomeProgressMetrics";
import type { PatientHomeProgressDisplay } from "@/modules/patient-home/patientHomeProgressMetrics";

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
  const serverRenderInstant = new Date();

  let appTz = await getAppDisplayTimeZone();

  const [homeBlocks, moodSetting, warmupRepeatSetting] = await Promise.all([
    deps.patientHomeBlocks.listBlocksWithItems(),
    deps.systemSettings.getSetting("patient_home_mood_icons", "admin"),
    deps.systemSettings.getSetting("patient_home_daily_warmup_repeat_cooldown_minutes", "admin"),
  ]);

  const dailyWarmupRepeatCooldownMinutes = parsePatientHomeDailyWarmupRepeatCooldownMinutes(
    warmupRepeatSetting?.valueJson ?? null,
  );

  const warmupPick =
    session && personalTierOk ?
      buildPatientHomeWarmupPickContext(session.user.userId, deps)
    : session ?
      { tier: "no_tier" as const }
    : { tier: "guest" as const };

  const homeConfigDeps = {
    patientHomeBlocks: deps.patientHomeBlocks,
    contentPages: deps.contentPages,
    contentSections: deps.contentSections,
    systemSettings: deps.systemSettings,
  };
  const presentationSyncDeps =
    session && personalTierOk ? buildDailyWarmupPresentationSyncDeps(deps) : undefined;

  const todayCfg = await getPatientHomeTodayConfig(homeConfigDeps, warmupPick, presentationSyncDeps);
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
  let progressMetrics: PatientHomeProgressDisplay | null =
    session ? await loadPatientHomeProgressMetrics(deps, session.user.userId, appTz) : null;
  let initialMoodCheckin: PatientMoodCheckinState | null = null;
  let moodWeekMarks: PatientMoodWeekMark[] = [];
  let moodWeekPreviousSundayHadMarks = false;
  let moodWeekPreviousSundayLastScore: PatientMoodScore | null = null;
  let moodWeekLastScoreBeforeWeek: PatientMoodScore | null = null;
  let hasConfiguredSchedule = false;
  let nextReminderMutedCaption: string | null = null;
  /** Единый «сейчас» для заголовка и mute; pick учитывает глобальную заглушку. */
  let patientHomeReminderEvaluatedAt: Date | null = null;
  let moodWeekTz = appTz;
  let dailyWarmupHeroCooldownActive = false;
  let warmupCooldownCaption: string | null = null;

  if (personalTierOk && session) {
    const warmupPageId = todayCfg.dailyWarmupItem?.page?.contentPageId;
    const [rules, instances, moodState, mutedUntilIso, patientCalTz, warmupCooldownMeta] = await Promise.all([
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
    ]);

    moodWeekTz = resolveCalendarDayIanaForPatient(patientCalTz, appTz);

    patientHomeReminderEvaluatedAt = new Date();
    const compareNow = patientHomeReminderEvaluatedAt;
    const muted = !!(mutedUntilIso && new Date(mutedUntilIso).getTime() > compareNow.getTime());
    hasConfiguredSchedule = hasConfiguredHomeLinkedReminders(rules);

    if (
      warmupCooldownMeta.active &&
      shouldActivateDailyWarmupHeroCooldown({
        dailyWarmupCount: todayCfg.dailyWarmupCount,
        cooldownActive: true,
      })
    ) {
      dailyWarmupHeroCooldownActive = true;
      warmupCooldownCaption = formatPatientHomeWarmupCooldownCaption(warmupCooldownMeta.minutesRemaining);
    }
    const weekSparkline = await deps.patientMood.getRecentDaysSparkline(
      session.user.userId,
      moodWeekTz,
      HOME_WELLBEING_STRIP_DAY_COUNT,
    );
    const scheduleInstant = reminderScheduleEvaluationInstant(patientHomeReminderEvaluatedAt, mutedUntilIso);
    homeReminder = pickNextHomeReminder(rules, scheduleInstant, appTz);
    const picked = pickActivePlanInstanceForPatientHome(instances);
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
    moodWeekMarks = weekSparkline.marks;
    moodWeekPreviousSundayHadMarks = weekSparkline.previousSundayHadMarks;
    moodWeekPreviousSundayLastScore = weekSparkline.previousSundayLastScore;
    moodWeekLastScoreBeforeWeek = weekSparkline.lastScoreBeforeWeek;
    if (muted) {
      const tail =
        mutedUntilIso?.trim() ? formatReminderMuteRemainingRu(mutedUntilIso.trim(), compareNow) : null;
      nextReminderMutedCaption = tail ? `Напоминания заглушены на ${tail}` : "Напоминания заглушены";
    }

  }

  const sorted = filterAndSortPatientHomeBlocks(homeBlocks);

  const nextReminderScheduleLabel =
    nextReminderMutedCaption ??
    (homeReminder
      ? formatPatientHomeNextReminderHeadline(
          homeReminder.nextAt,
          patientHomeReminderEvaluatedAt ?? new Date(),
          appTz,
        )
      : hasConfiguredSchedule
        ? "Ближайших напоминаний нет"
        : "Напоминания не настроены");

  const personalizedName =
    personalTierOk && session ? patientGreetingPersonalizedName(session.user) : null;
  const timeOfDayPrefix = greetingPrefixFromHour(DateTime.now().setZone(appTz).hour);
  const unreadChatCount =
    session && personalTierOk ? await deps.messaging.patient.unreadCount(session.user.userId) : 0;

  const blockLeadingIconFor = (code: PatientHomeBlockCode) => {
    const cmsIcon = homeBlocks.find((b) => b.code === code)?.iconImageUrl ?? null;
    const resolved = resolvePatientHomeBlockLeadingIconUrl(code, cmsIcon);
    if (resolved?.startsWith("/patient/")) return resolved;
    return stripApiMediaForAnonymousGuest(resolved, anonymousGuest);
  };

  const wellbeingWeekAnchorNowMs =
    patientHomeReminderEvaluatedAt?.getTime() ?? serverRenderInstant.getTime();
  const wellbeingWeekTodayIso =
    DateTime.fromMillis(wellbeingWeekAnchorNowMs, { zone: moodWeekTz }).startOf("day").toISODate() ?? "";

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
            metrics={progressMetrics}
            anonymousGuest={anonymousGuest}
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
            moodWeekMarks={moodWeekMarks}
            moodWeekAnchorDayBeforeWindowHadMarks={moodWeekPreviousSundayHadMarks}
            moodWeekAnchorDayBeforeWindowLastScore={moodWeekPreviousSundayLastScore}
            moodWeekLastScoreBeforeWindow={moodWeekLastScoreBeforeWeek}
            wellbeingWeekTimeZone={moodWeekTz}
            wellbeingWeekAnchorNowMs={wellbeingWeekAnchorNowMs}
            wellbeingWeekTodayIso={wellbeingWeekTodayIso}
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
    <PatientHomeTodayLayout
      personalizedName={personalizedName}
      timeOfDayPrefix={timeOfDayPrefix}
      unreadChatCount={unreadChatCount}
      blocks={layoutBlocks}
    />
  );
}

function checklistHadAnyCompletionToday(snap: ChecklistTodaySnapshot): boolean {
  if (snap.doneItemIds.length > 0) return true;
  if (Object.values(snap.doneTodayCountByItemId).some((n) => n > 0)) return true;
  if (Object.values(snap.doneTodayCountByActivityKey).some((n) => n > 0)) return true;
  return false;
}
