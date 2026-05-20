import { DateTime } from "luxon";
import type { ContentSectionsPort } from "@/modules/content-sections/ports";
import { resolveCalendarDayIanaForPatient } from "@/modules/system-settings/calendarIana";
import { pickActivePlanInstance } from "@/modules/treatment-program/pickActivePlanInstance";
import type { ReminderRule } from "@/modules/reminders/types";
import type { PatientPracticeCompletionRow } from "@/modules/patient-practice/types";
import { patientHomeLocalDayUtcWindow } from "./patientHomeTodayProgress";
import {
  buildPatientHomeProgressDisplay,
  collectActivityLocalDates,
  computePatientHomeActivityStreak,
  countTrainingPlannedSlotsInUtcRange,
  countTrainingSessionsFromDoneTimestamps,
  countWarmupDoneToday,
  countWarmupPlannedSlotsInUtcRange,
  type PatientHomeProgressDisplay,
} from "./patientHomeProgressMetrics";

export type LoadPatientHomeProgressMetricsDeps = {
  reminders: {
    listRulesByUser(userId: string): Promise<ReminderRule[]>;
    getReminderMutedUntil(userId: string): Promise<string | null>;
  };
  patientPractice: {
    listByUserInUtcRange(userId: string, fromUtcIso: string, toUtcExclusiveIso: string): Promise<PatientPracticeCompletionRow[]>;
    listRecent(userId: string, limit: number): Promise<PatientPracticeCompletionRow[]>;
  };
  patientCalendarTimezone: {
    getIanaForUser(userId: string): Promise<string | null>;
  };
  treatmentProgramInstance: {
    listForPatient(userId: string): Promise<Parameters<typeof pickActivePlanInstance>[0]>;
  };
  treatmentProgramPatientActions: {
    listProgramDoneTimestampsToday(userId: string, instanceId: string): Promise<string[]>;
    listLocalDoneDateKeysForRecentDays(
      userId: string,
      days: number,
    ): Promise<{ iana: string; dateKeys: string[] }>;
  };
};

/**
 * Пять показателей прогресса на главной (календарный день пациента, слоты из расписания).
 */
export async function loadPatientHomeProgressMetrics(
  deps: LoadPatientHomeProgressMetricsDeps,
  userId: string,
  appTz: string,
): Promise<PatientHomeProgressDisplay> {
  const [rules, patientCalTz, mutedUntilIso, recentPracticeRows, lfkRecentDays] = await Promise.all([
    deps.reminders.listRulesByUser(userId),
    deps.patientCalendarTimezone.getIanaForUser(userId),
    deps.reminders.getReminderMutedUntil(userId),
    deps.patientPractice.listRecent(userId, 1500),
    deps.treatmentProgramPatientActions.listLocalDoneDateKeysForRecentDays(userId, 120),
  ]);

  const patientDayIana = resolveCalendarDayIanaForPatient(patientCalTz, appTz);
  const muted =
    !!(mutedUntilIso && new Date(mutedUntilIso).getTime() > Date.now());

  const dayStart = DateTime.now().setZone(patientDayIana).startOf("day");
  const rangeStart = dayStart.toUTC().toJSDate();
  const rangeEnd = dayStart.plus({ days: 1 }).toUTC().toJSDate();

  const warmupPlanned = muted ? 0 : countWarmupPlannedSlotsInUtcRange(rules, rangeStart, rangeEnd);
  const trainingPlanned = muted ? 0 : countTrainingPlannedSlotsInUtcRange(rules, rangeStart, rangeEnd);

  const todayYmd = dayStart.toISODate()!;
  const todayDayWin = patientHomeLocalDayUtcWindow(todayYmd, patientDayIana);
  const todayPracticeRows = await deps.patientPractice.listByUserInUtcRange(
    userId,
    todayDayWin.start.toISOString(),
    todayDayWin.end.toISOString(),
  );
  const warmupDone = countWarmupDoneToday(todayPracticeRows);

  let trainingDone = 0;
  const activePlan = pickActivePlanInstance(await deps.treatmentProgramInstance.listForPatient(userId));
  if (activePlan) {
    const timestamps = await deps.treatmentProgramPatientActions.listProgramDoneTimestampsToday(
      userId,
      activePlan.id,
    );
    trainingDone = countTrainingSessionsFromDoneTimestamps(timestamps);
  }

  const activityDates = collectActivityLocalDates({
    practiceRows: recentPracticeRows,
    programDoneDateKeys: lfkRecentDays.dateKeys,
    patientDayIana: lfkRecentDays.iana || patientDayIana,
  });
  const streakDays = computePatientHomeActivityStreak(activityDates, patientDayIana);

  return buildPatientHomeProgressDisplay({
    warmupPlanned,
    warmupDone,
    trainingPlanned,
    trainingDone,
    streakDays,
  });
}
