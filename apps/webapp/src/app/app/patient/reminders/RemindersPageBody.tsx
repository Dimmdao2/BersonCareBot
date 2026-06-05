import { DateTime } from "luxon";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import type { ReminderRule } from "@/modules/reminders/types";
import { cn } from "@/lib/utils";
import { patientInnerPageStackClass, patientMutedTextClass } from "@/shared/ui/patient/patientVisual";
import { formatBookingDateTimeMediumRu } from "@/shared/lib/formatBusinessDateTime";
import { getAppDisplayTimeZone } from "@/modules/system-settings/appDisplayTimezone";
import { resolveCalendarDayIanaForPatient } from "@/modules/system-settings/calendarIana";
import { ReminderRulesClient, type PersonalReminderRowVM } from "./ReminderRulesClient";
import { resolvePatientContentSectionSlug } from "@/infra/repos/resolvePatientContentSectionSlug";
import { DEFAULT_WARMUPS_SECTION_SLUG } from "@/modules/patient-home/warmupsSection";
import { isWarmupsContentSectionReminderRule } from "@/modules/reminders/warmupsReminderRuleMatch";
import { resolvePatientCanViewAuthOnlyContent } from "@/modules/platform-access";
import { resolveActiveTreatmentProgramInstanceId } from "@/modules/treatment-program/patientTreatmentProgramEntry";
import { RemindersHashScroll } from "./RemindersHashScroll";
import { RemindersPageAdditionalSection } from "./RemindersPageAdditionalSection";
import { filterPersonalRulesForSchedulePage } from "./filterPersonalRulesForSchedulePage";
import type { AppSession } from "@/shared/types/session";
import {
  EXERCISE_REMINDERS_TOPIC,
  resolveActiveReminderDeliveryLabelsForTopic,
} from "@/modules/reminders/reminderDeliveryChannelLabels";

function mapIconKind(linked: NonNullable<ReminderRule["linkedObjectType"]>): PersonalReminderRowVM["iconKind"] {
  switch (linked) {
    case "lfk_complex":
      return "lfk";
    case "rehab_program":
      return "rehab";
    case "content_section":
      return "warmup";
    case "content_page":
      return "page";
    case "treatment_program_item":
      return "rehab";
    // Legacy `linkedObjectType=custom`: UI create/edit снят; правила отфильтрованы до mapIconKind (filterPersonalRulesForSchedulePage).
    case "custom":
      return "custom";
    default:
      // Fallback для неизвестных linkedObjectType; раньше часто совпадал с custom.
      return "custom";
  }
}

async function resolvePersonalReminderLabel(
  deps: ReturnType<typeof buildAppDeps>,
  userId: string,
  rule: ReminderRule,
): Promise<string> {
  const lo = rule.linkedObjectType;
  const id = rule.linkedObjectId;
  if (!lo) return "";
  if (lo === "lfk_complex") {
    if (id) {
      const cx = await deps.diaries.getLfkComplexForUser({ userId, complexId: id });
      return cx?.title?.trim() || "Занятие";
    }
    return "Занятие";
  }
  if (lo === "content_section") {
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
    // Legacy custom reminders: не попадают в personalRows; ветка для типобезопасности и будущего read-only отображения.
    return rule.customTitle?.trim() || "Своё напоминание";
  }
  if (lo === "rehab_program") {
    return rule.displayTitle?.trim() || "Программа реабилитации";
  }
  if (lo === "treatment_program_item") {
    return rule.displayTitle?.trim() || "Пункт программы";
  }
  return "Напоминание";
}

export async function RemindersPageBody({ session }: { session: AppSession }) {
  const deps = buildAppDeps();
  const userId = session.user.userId;

  const [rules, appTz, patientIanaRaw, programList, canViewAuth, exerciseDeliveryChannelLabels] =
    await Promise.all([
      deps.reminders.listRulesByUser(userId),
      getAppDisplayTimeZone(),
      deps.patientCalendarTimezone.getIanaForUser(userId),
      deps.treatmentProgramInstance.listForPatient(userId),
      resolvePatientCanViewAuthOnlyContent(session),
      resolveActiveReminderDeliveryLabelsForTopic({
        platformUserId: userId,
        topicCode: EXERCISE_REMINDERS_TOPIC,
        bindings: {
          telegramId: session.user.bindings.telegramId,
          maxId: session.user.bindings.maxId,
        },
        channelPreferences: deps.channelPreferencesPort,
        topicChannelPrefs: deps.topicChannelPrefs,
        webPushSubscriptions: deps.webPushSubscriptions,
      }),
    ]);

  const patientCalendarDayIana = resolveCalendarDayIanaForPatient(patientIanaRaw, appTz);
  const calendarDateKey = DateTime.now().setZone(patientCalendarDayIana).toISODate()!;

  const warmRes = await resolvePatientContentSectionSlug(
    {
      getBySlug: (s) => deps.contentSections.getBySlug(s),
      getRedirectNewSlugForOldSlug: (s) => deps.contentSections.getRedirectNewSlugForOldSlug(s),
    },
    DEFAULT_WARMUPS_SECTION_SLUG,
  );
  const warmupsSectionAvailable = Boolean(
    warmRes && (!warmRes.section.requiresAuth || canViewAuth),
  );
  const warmupsSectionTitle = warmRes?.section.title?.trim() || "Разминки";
  const warmupsSectionSlug = (warmRes?.canonicalSlug ?? DEFAULT_WARMUPS_SECTION_SLUG).trim();

  const activeInstanceId = await resolveActiveTreatmentProgramInstanceId(deps, userId);
  let rehabProgramForBlock: { id: string; title: string } | null = null;
  if (activeInstanceId) {
    const row = programList.find((p) => p.id === activeInstanceId);
    rehabProgramForBlock = {
      id: activeInstanceId,
      title: row?.title?.trim() || "Программа реабилитации",
    };
  }

  const rehabMatches =
    rehabProgramForBlock ?
      rules.filter(
        (r) => r.linkedObjectType === "rehab_program" && r.linkedObjectId === rehabProgramForBlock.id,
      )
    : [];
  rehabMatches.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  const rehabRuleForBlock = rehabMatches[0] ?? null;

  const warmMatches = rules.filter((r) => isWarmupsContentSectionReminderRule(r, warmupsSectionSlug));
  warmMatches.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  const warmupRuleForBlock = warmMatches[0] ?? null;

  const mutedUntil = await deps.reminders.getReminderMutedUntil(userId);
  const compareNow = new Date();
  const muteActive = Boolean(
    mutedUntil?.trim() && new Date(mutedUntil).getTime() > compareNow.getTime(),
  );
  const muteUntilLabel =
    muteActive && mutedUntil?.trim() ? formatBookingDateTimeMediumRu(mutedUntil.trim(), appTz) : null;

  const journalStats = deps.reminderJournal
    ? await deps.reminderJournal.statsPerRuleForUser(userId, 30)
    : {};

  const personalRules = filterPersonalRulesForSchedulePage(rules, {
    rehabProgramForBlock,
    warmupsSectionAvailable,
    warmupsSectionSlug,
  });
  personalRules.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));

  const personalRows: PersonalReminderRowVM[] = [];
  for (const r of personalRules) {
    const label = await resolvePersonalReminderLabel(deps, userId, r);
    const iconKind = mapIconKind(r.linkedObjectType!);
    const st = journalStats[r.id] ?? { done: 0, skipped: 0, snoozed: 0 };
    personalRows.push({ rule: r, label, iconKind, stats: st });
  }

  return (
    <div className={cn(patientInnerPageStackClass, "pb-10 md:pb-14")}>
      <RemindersHashScroll />
      <p className={cn(patientMutedTextClass, "mb-4")}>
        Настройте расписание – это обновит ваши цели активности.
      </p>

      <ReminderRulesClient
        personalRows={personalRows}
        legacyRules={[]}
        activeProgram={rehabProgramForBlock}
        warmupsSectionAvailable={warmupsSectionAvailable}
        warmupsSectionSlug={warmupsSectionSlug}
        warmupsSectionTitle={warmupsSectionTitle}
        rehabRuleForBlock={rehabRuleForBlock}
        warmupRuleForBlock={warmupRuleForBlock}
        calendarDateKey={calendarDateKey}
        patientCalendarDayIana={patientCalendarDayIana}
        exerciseDeliveryChannelLabels={exerciseDeliveryChannelLabels}
      />

      <RemindersPageAdditionalSection muteUntilLabel={muteUntilLabel} />
    </div>
  );
}
