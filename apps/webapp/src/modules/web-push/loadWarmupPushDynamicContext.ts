import { DateTime } from "luxon";
import {
  countWarmupCompletionsInRows,
  patientHomeLocalDayUtcWindow,
} from "@/modules/patient-home/patientHomeTodayProgress";
import { countPlannedHomeLinkedReminderOccurrencesWithPredicate } from "@/modules/patient-home/nextReminderOccurrence";
import {
  listDailyWarmupPagesForHome,
  resolveDailyWarmupPickIndex,
} from "@/modules/patient-home/todayConfig";
import { resolveCalendarDayIanaForPatient } from "@/modules/system-settings/calendarIana";
import { getAppDisplayTimeZone } from "@/modules/system-settings/appDisplayTimezone";
import { isWarmupsContentSectionReminderRule } from "@/modules/reminders/warmupsReminderRuleMatch";
import { DEFAULT_WARMUPS_SECTION_SLUG } from "@/modules/patient-home/warmupsSection";
import type { ReminderRule } from "@/modules/reminders/types";
import type { PatientPracticeCompletionRow } from "@/modules/patient-practice/types";
import type { WarmupPushDynamicContext } from "./pushNotificationCopy";

export type LoadWarmupPushDynamicContextDeps = {
  listRulesByUser: (userId: string) => Promise<ReminderRule[]>;
  listPracticeCompletionsInRange: (
    userId: string,
    start: Date,
    end: Date,
  ) => Promise<PatientPracticeCompletionRow[]>;
  patientHomeBlocks: Parameters<typeof listDailyWarmupPagesForHome>[0]["patientHomeBlocks"];
  contentPages: Parameters<typeof listDailyWarmupPagesForHome>[0]["contentPages"];
  contentSections: Parameters<typeof listDailyWarmupPagesForHome>[0]["contentSections"];
  getPatientCalendarIana: (userId: string) => Promise<string | null>;
  getLatestDailyWarmupCompletedContentPageId: (userId: string) => Promise<string | null>;
  getPresentedDailyWarmupContentPageId: (userId: string) => Promise<string | null>;
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

  const dailyPages = await listDailyWarmupPagesForHome({
    patientHomeBlocks: deps.patientHomeBlocks,
    contentPages: deps.contentPages,
    contentSections: deps.contentSections,
    systemSettings: {
      getSetting: async () => null,
    },
  });
  const pickIndex = await resolveDailyWarmupPickIndex(
    dailyPages,
    {
      tier: "patient",
      userId: platformUserId,
      getLatestCompletedContentPageId: deps.getLatestDailyWarmupCompletedContentPageId,
      getPresentedContentPageId: deps.getPresentedDailyWarmupContentPageId,
    },
    "push_reminder",
  );
  const dailyWarmupTitle = dailyPages[pickIndex]?.title?.trim() || null;

  const warmupPlanned = countPlannedHomeLinkedReminderOccurrencesWithPredicate(
    rules,
    (rule) =>
      isWarmupsContentSectionReminderRule(rule, DEFAULT_WARMUPS_SECTION_SLUG),
    start,
    end,
  );

  const completions = await deps.listPracticeCompletionsInRange(platformUserId, start, end);
  const warmupDone = countWarmupCompletionsInRows(completions);
  const warmupsRemaining = warmupPlanned > warmupDone ? warmupPlanned - warmupDone : 0;

  return {
    dailyWarmupTitle,
    warmupsRemaining: warmupsRemaining > 0 ? warmupsRemaining : null,
  };
}
