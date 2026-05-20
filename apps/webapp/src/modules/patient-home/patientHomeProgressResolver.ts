import { DateTime } from "luxon";
import type { ContentSectionsPort } from "@/modules/content-sections/ports";
import { resolvePatientContentSectionSlug } from "@/infra/repos/resolvePatientContentSectionSlug";
import { isWarmupsContentSectionReminderRule } from "@/modules/reminders/warmupsReminderRuleMatch";
import { computePracticeStreak } from "@/modules/patient-practice/streakLogic";
import { resolveCalendarDayIanaForPatient } from "@/modules/system-settings/calendarIana";
import { pickActivePlanInstance } from "@/modules/treatment-program/pickActivePlanInstance";
import type { ReminderRule } from "@/modules/reminders/types";
import type { PatientPracticeCompletionRow } from "@/modules/patient-practice/types";
import { DEFAULT_WARMUPS_SECTION_SLUG } from "./warmupsSection";
import {
  assemblePatientHomeProgress,
  countProgramChecklistItemsDoneToday,
  countWarmupCompletionsInRows,
  patientHomeLocalDayUtcWindow,
  resolvePatientHomePracticeTarget,
} from "./patientHomeTodayProgress";
import {
  countPlannedHomeLinkedReminderOccurrencesWithPredicate,
  countPlannedHomeReminderOccurrencesInUtcRange,
  hasConfiguredHomeLinkedReminders,
} from "./nextReminderOccurrence";

export type PatientHomeProgressSnapshot = {
  todayDone: number;
  todayTarget: number;
  streak: number;
};

export type PatientHomeProgressResolverDeps = {
  reminders: {
    listRulesByUser(userId: string): Promise<ReminderRule[]>;
    getReminderMutedUntil(userId: string): Promise<string | null>;
  };
  patientPractice: {
    listByUserInUtcRange(userId: string, fromUtcIso: string, toUtcExclusiveIso: string): Promise<PatientPracticeCompletionRow[]>;
    listRecent(userId: string, limit: number): Promise<PatientPracticeCompletionRow[]>;
    getProgress(userId: string, tz: string, todayTarget: number): Promise<{ todayDone: number; todayTarget: number; streak: number }>;
  };
  patientCalendarTimezone: {
    getIanaForUser(userId: string): Promise<string | null>;
  };
  treatmentProgramInstance: {
    listForPatient(userId: string): Promise<Parameters<typeof pickActivePlanInstance>[0]>;
  };
  treatmentProgramPatientActions: {
    listChecklistDoneToday(
      userId: string,
      instanceId: string,
    ): Promise<Parameters<typeof countProgramChecklistItemsDoneToday>[0]>;
    listLocalDoneDateKeysForRecentDays(
      userId: string,
      days: number,
    ): Promise<{ iana: string; dateKeys: string[] }>;
  };
  contentSections: Pick<ContentSectionsPort, "getBySlug" | "getRedirectNewSlugForOldSlug">;
};

/**
 * Прогресс «Сегодня» для API и главной: календарный день пациента, разминки только `daily_warmup`,
 * цель из слотов напоминаний или `patient_home_daily_practice_target`.
 */
export async function loadPatientHomeProgressForUser(
  deps: PatientHomeProgressResolverDeps,
  userId: string,
  appTz: string,
  adminPracticeTarget: number,
): Promise<PatientHomeProgressSnapshot> {
  const [rules, patientCalTz, mutedUntilIso, recentPracticeRows, lfkRecentDays] = await Promise.all([
    deps.reminders.listRulesByUser(userId),
    deps.patientCalendarTimezone.getIanaForUser(userId),
    deps.reminders.getReminderMutedUntil(userId),
    deps.patientPractice.listRecent(userId, 1500),
    deps.treatmentProgramPatientActions.listLocalDoneDateKeysForRecentDays(userId, 120),
  ]);

  const patientDayIana = resolveCalendarDayIanaForPatient(patientCalTz, appTz);
  const compareNow = new Date();
  const muted = !!(mutedUntilIso && new Date(mutedUntilIso).getTime() > compareNow.getTime());
  const dayStart = DateTime.now().setZone(patientDayIana).startOf("day");
  const rangeStart = dayStart.toUTC().toJSDate();
  const rangeEnd = dayStart.plus({ days: 1 }).toUTC().toJSDate();

  const hasConfiguredSchedule = hasConfiguredHomeLinkedReminders(rules);
  const plannedTotal = muted ? 0 : countPlannedHomeReminderOccurrencesInUtcRange(rules, rangeStart, rangeEnd);
  const practiceTarget = resolvePatientHomePracticeTarget({
    muted,
    hasConfiguredHomeLinkedReminders: hasConfiguredSchedule,
    plannedTotal,
    adminPracticeTarget,
  });

  const warmRes = await resolvePatientContentSectionSlug(
    {
      getBySlug: (s) => deps.contentSections.getBySlug(s),
      getRedirectNewSlugForOldSlug: (s) => deps.contentSections.getRedirectNewSlugForOldSlug(s),
    },
    DEFAULT_WARMUPS_SECTION_SLUG,
  );
  const warmupsLinkedId = (warmRes?.canonicalSlug ?? DEFAULT_WARMUPS_SECTION_SLUG).trim();
  const warmupPlanned = muted
    ? 0
    : countPlannedHomeLinkedReminderOccurrencesWithPredicate(
        rules,
        (r) => isWarmupsContentSectionReminderRule(r, warmupsLinkedId),
        rangeStart,
        rangeEnd,
      );
  const lfkPlanned = plannedTotal - warmupPlanned;

  const todayYmd = DateTime.now().setZone(patientDayIana).toISODate()!;
  const todayDayWin = patientHomeLocalDayUtcWindow(todayYmd, patientDayIana);
  const todayPracticeRows = await deps.patientPractice.listByUserInUtcRange(
    userId,
    todayDayWin.start.toISOString(),
    todayDayWin.end.toISOString(),
  );
  const warmupDoneToday = countWarmupCompletionsInRows(todayPracticeRows);

  let programDoneToday = 0;
  const instances = await deps.treatmentProgramInstance.listForPatient(userId);
  const picked = pickActivePlanInstance(instances);
  const doctorPlan = picked?.assignmentSource === "doctor" ? picked : null;
  if (doctorPlan) {
    const snap = await deps.treatmentProgramPatientActions.listChecklistDoneToday(userId, doctorPlan.id);
    programDoneToday = countProgramChecklistItemsDoneToday(snap);
  }

  const assembled = assemblePatientHomeProgress({
    practiceTarget,
    warmupDoneToday,
    programDoneToday,
    warmupPlanned,
    lfkPlanned,
    hasConfiguredSchedule,
    muted,
    plannedTotal,
  });

  const gp = await deps.patientPractice.getProgress(userId, patientDayIana, practiceTarget || 1);
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

  return {
    todayDone: assembled.todayDone,
    todayTarget: assembled.practiceTarget,
    streak: Math.max(gp.streak, mergedStreak),
  };
}
