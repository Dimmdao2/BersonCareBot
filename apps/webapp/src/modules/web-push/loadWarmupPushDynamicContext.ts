import { DateTime } from "luxon";
import {
  countWarmupCompletionsInRows,
  patientHomeLocalDayUtcWindow,
} from "@/modules/patient-home/patientHomeTodayProgress";
import { countPlannedHomeLinkedReminderOccurrencesWithPredicate } from "@/modules/patient-home/nextReminderOccurrence";
import { listDailyWarmupPagesForHome } from "@/modules/patient-home/todayConfig";
import { resolveCalendarDayIanaForPatient } from "@/modules/system-settings/calendarIana";
import { getAppDisplayTimeZone } from "@/modules/system-settings/appDisplayTimezone";
import { isWarmupsContentSectionReminderRule } from "@/modules/reminders/warmupsReminderRuleMatch";
import { DEFAULT_WARMUPS_SECTION_SLUG } from "@/modules/patient-home/warmupsSection";
import type { ReminderRule } from "@/modules/reminders/types";
import type { WarmupPushDynamicContext } from "./pushNotificationCopy";

export type LoadWarmupPushDynamicContextDeps = {
  listRulesByUser: (userId: string) => Promise<ReminderRule[]>;
  listPracticeCompletionsInRange: (
    userId: string,
    start: Date,
    end: Date,
  ) => Promise<Array<{ source: string }>>;
  patientHomeBlocks: Parameters<typeof listDailyWarmupPagesForHome>[0]["patientHomeBlocks"];
  contentPages: Parameters<typeof listDailyWarmupPagesForHome>[0]["contentPages"];
  contentSections: Parameters<typeof listDailyWarmupPagesForHome>[0]["contentSections"];
  getPatientCalendarIana: (userId: string) => Promise<string | null>;
};

export async function loadWarmupPushDynamicContext(
  platformUserId: string,
  deps: LoadWarmupPushDynamicContextDeps,
): Promise<WarmupPushDynamicContext> {
  const [appTz, patientIanaRaw, rules] = await Promise.all([
    getAppDisplayTimeZone(),
    deps.getPatientCalendarIana(platformUserId),
    deps.listRulesByUser(platformUserId),
  ]);
  const patientIana = resolveCalendarDayIanaForPatient(patientIanaRaw, appTz);
  const localYmd = DateTime.now().setZone(patientIana).toISODate()!;
  const { start, end } = patientHomeLocalDayUtcWindow(localYmd, patientIana);

  const weekdayMonday0 = DateTime.now().setZone(appTz).weekday - 1;
  const dailyPages = await listDailyWarmupPagesForHome({
    patientHomeBlocks: deps.patientHomeBlocks,
    contentPages: deps.contentPages,
    contentSections: deps.contentSections,
    systemSettings: {
      getSetting: async () => null,
    },
  });
  const n = dailyPages.length;
  const dailyWarmupTitle =
    n > 0 ? dailyPages[((weekdayMonday0 % n) + n) % n]?.title?.trim() || null : null;

  const warmupPlanned = countPlannedHomeLinkedReminderOccurrencesWithPredicate(
    rules,
    (rule) =>
      isWarmupsContentSectionReminderRule(rule, DEFAULT_WARMUPS_SECTION_SLUG),
    start,
    end,
  );

  const completions = await deps.listPracticeCompletionsInRange(platformUserId, start, end);
  const warmupDone = countWarmupCompletionsInRows(
    completions as Parameters<typeof countWarmupCompletionsInRows>[0],
  );
  const warmupsRemaining = warmupPlanned > warmupDone ? warmupPlanned - warmupDone : 0;

  return {
    dailyWarmupTitle,
    warmupsRemaining: warmupsRemaining > 0 ? warmupsRemaining : null,
  };
}
