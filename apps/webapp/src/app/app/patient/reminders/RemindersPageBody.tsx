import { DateTime } from "luxon";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import type { ReminderRule } from "@/modules/reminders/types";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { patientCardClass, patientMutedTextClass } from "@/shared/ui/patientVisual";
import { formatBookingDateTimeMediumRu } from "@/shared/lib/formatBusinessDateTime";
import { getAppDisplayTimeZone } from "@/modules/system-settings/appDisplayTimezone";
import { resolveCalendarDayIanaForPatient } from "@/modules/system-settings/calendarIana";
import { ReminderRulesClient, type PersonalReminderRowVM } from "./ReminderRulesClient";
import { resolvePatientContentSectionSlug } from "@/infra/repos/resolvePatientContentSectionSlug";
import { DEFAULT_WARMUPS_SECTION_SLUG } from "@/modules/patient-home/warmupsSection";
import { resolvePatientCanViewAuthOnlyContent } from "@/modules/platform-access";
import { RemindersHashScroll } from "./RemindersHashScroll";
import { PatientRemindersMuteBar } from "./PatientRemindersMuteBar";
import type { AppSession } from "@/shared/types/session";

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
    case "custom":
      return "custom";
    default:
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
    return rule.customTitle?.trim() || "Своё напоминание";
  }
  if (lo === "rehab_program") {
    return rule.displayTitle?.trim() || "Программа реабилитации";
  }
  return "Напоминание";
}

export async function RemindersPageBody({ session }: { session: AppSession }) {
  const deps = buildAppDeps();
  const userId = session.user.userId;

  const [rules, projectionStats, appTz, patientIanaRaw, programList, canViewAuth] = await Promise.all([
    deps.reminders.listRulesByUser(userId),
    deps.reminderProjection.getStats(userId, 30),
    getAppDisplayTimeZone(),
    deps.patientCalendarTimezone.getIanaForUser(userId),
    deps.treatmentProgramInstance.listForPatient(userId),
    resolvePatientCanViewAuthOnlyContent(session),
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

  const activeCandidates = programList
    .filter((p) => p.status === "active")
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.id.localeCompare(a.id));
  const activeProgram = activeCandidates[0] ?? null;

  const rehabMatches = activeProgram
    ? rules.filter((r) => r.linkedObjectType === "rehab_program" && r.linkedObjectId === activeProgram.id)
    : [];
  rehabMatches.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  const rehabRuleForBlock = rehabMatches[0] ?? null;

  const warmMatches = rules.filter(
    (r) => r.linkedObjectType === "content_section" && r.linkedObjectId === DEFAULT_WARMUPS_SECTION_SLUG,
  );
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

  const personalRules = rules.filter((r) => r.linkedObjectType != null);
  personalRules.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));

  const legacyRules = rules.filter((r) => r.linkedObjectType == null);

  const personalRows: PersonalReminderRowVM[] = [];
  for (const r of personalRules) {
    const label = await resolvePersonalReminderLabel(deps, userId, r);
    const iconKind = mapIconKind(r.linkedObjectType!);
    const st = journalStats[r.id] ?? { done: 0, skipped: 0, snoozed: 0 };
    personalRows.push({ rule: r, label, iconKind, stats: st });
  }

  return (
    <>
      <RemindersHashScroll />
      <p className={cn(patientMutedTextClass, "mb-4")}>
        Программа реабилитации, разминки, свои напоминания и категории от врача. Изменения синхронизируются с ботом.
      </p>

      <PatientRemindersMuteBar muteUntilLabel={muteUntilLabel} />

      <Card className={cn(patientCardClass, "mb-4")}>
        <CardContent className="pb-4 pt-4">
          <p
            className={cn(
              patientMutedTextClass,
              "mb-2 text-xs font-semibold uppercase tracking-wide",
            )}
          >
            Уведомления за 30 дней
          </p>
          <p className={cn(patientMutedTextClass, "mb-3 text-xs")}>
            По напоминаниям из бота и приложения.
          </p>
          <div className="flex flex-wrap gap-4 text-sm">
            <span>
              <span className="font-medium">{projectionStats.total}</span>{" "}
              <span className={patientMutedTextClass}>отправлено</span>
            </span>
            <span>
              <span className="font-medium">{projectionStats.seen}</span>{" "}
              <span className={patientMutedTextClass}>просмотрено</span>
            </span>
            <span>
              <span className="font-medium">{projectionStats.unseen}</span>{" "}
              <span className={patientMutedTextClass}>без открытия</span>
            </span>
          </div>
        </CardContent>
      </Card>

      <ReminderRulesClient
        personalRows={personalRows}
        legacyRules={legacyRules}
        unseenCount={projectionStats.unseen}
        activeProgram={
          activeProgram ? { id: activeProgram.id, title: activeProgram.title?.trim() || "Программа" } : null
        }
        warmupsSectionAvailable={warmupsSectionAvailable}
        warmupsSectionTitle={warmupsSectionTitle}
        rehabRuleForBlock={rehabRuleForBlock}
        warmupRuleForBlock={warmupRuleForBlock}
        calendarDateKey={calendarDateKey}
        patientCalendarDayIana={patientCalendarDayIana}
      />
    </>
  );
}
