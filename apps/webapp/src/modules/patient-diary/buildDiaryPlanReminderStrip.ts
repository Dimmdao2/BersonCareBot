import { DateTime } from "luxon";
import type { PatientPlanTodayRemindersCardProps } from "@/app/app/patient/treatment/program-detail/PatientPlanTodayRemindersCard";
import { routePaths } from "@/app-layer/routes/paths";
import {
  resolvePatientContentSectionSlug,
  type PatientContentSectionSlugResolverDeps,
} from "@/modules/content-sections/resolvePatientContentSectionSlug";
import { DEFAULT_WARMUPS_SECTION_SLUG } from "@/modules/patient-home/warmupsSection";
import { formatPlanReminderTodayLine } from "@/modules/reminders/summarizeReminderForCalendarDay";
import type { ReminderRule } from "@/modules/reminders/types";
import { resolveCalendarDayIanaForPatient } from "@/modules/system-settings/calendarIana";
import { getAppDisplayTimeZone } from "@/modules/system-settings/appDisplayTimezone";
import { pickActivePlanInstance } from "@/modules/treatment-program/pickActivePlanInstance";

type Deps = {
  reminders: { listRulesByUser: (userId: string) => Promise<ReminderRule[]> };
  treatmentProgramInstance: {
    listForPatient: (
      userId: string,
    ) => Promise<import("@/modules/treatment-program/types").TreatmentProgramInstanceSummary[]>;
  };
  patientCalendarTimezone: { getIanaForUser: (userId: string) => Promise<string | null> };
  contentSections: PatientContentSectionSlugResolverDeps;
};

function pickLinkedReminderRule(
  rules: ReminderRule[],
  linkedObjectType: ReminderRule["linkedObjectType"],
  linkedObjectId: string,
): ReminderRule | null {
  const matches = rules.filter(
    (r) => r.linkedObjectType === linkedObjectType && r.linkedObjectId === linkedObjectId,
  );
  matches.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  return matches[0] ?? null;
}

/** Пропсы карточки «Расписание» на странице дневника (как на активной программе, без поддержки). */
export async function buildDiaryPlanReminderStrip(
  deps: Deps,
  userId: string,
  canViewAuthOnlyContent: boolean,
): Promise<PatientPlanTodayRemindersCardProps> {
  const [rules, instances, patientIana, appTz, warmRes] = await Promise.all([
    deps.reminders.listRulesByUser(userId),
    deps.treatmentProgramInstance.listForPatient(userId),
    deps.patientCalendarTimezone.getIanaForUser(userId),
    getAppDisplayTimeZone(),
    resolvePatientContentSectionSlug(deps.contentSections, DEFAULT_WARMUPS_SECTION_SLUG),
  ]);

  const activePlan = pickActivePlanInstance(instances);
  const resolvedIana = resolveCalendarDayIanaForPatient(patientIana, appTz);
  const warmupsSectionAvailable = Boolean(warmRes && (!warmRes.section.requiresAuth || canViewAuthOnlyContent));
  const warmupsLinkedId = (warmRes?.canonicalSlug ?? DEFAULT_WARMUPS_SECTION_SLUG).trim();
  const calendarDateKey = DateTime.now().setZone(resolvedIana).toISODate()!;
  const now = new Date();

  const rehabRuleForStrip =
    activePlan ? pickLinkedReminderRule(rules, "rehab_program", activePlan.id) : null;
  const warmupRuleForStrip = pickLinkedReminderRule(rules, "content_section", warmupsLinkedId);

  return {
    rehabTodayLine: formatPlanReminderTodayLine(rehabRuleForStrip, calendarDateKey, resolvedIana, now),
    warmupTodayLine: warmupsSectionAvailable
      ? formatPlanReminderTodayLine(warmupRuleForStrip, calendarDateKey, resolvedIana, now)
      : null,
    remindersHref:
      activePlan ? `${routePaths.patientReminders}#patient-reminders-rehab` : routePaths.patientReminders,
  };
}
