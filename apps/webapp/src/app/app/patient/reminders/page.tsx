import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requirePatientAccess } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";
import type { ReminderRule } from "@/modules/reminders/types";
import { AppShell } from "@/shared/ui/AppShell";
import { Card, CardContent } from "@/components/ui/card";
import { ReminderRulesClient, type PersonalReminderRowVM } from "./ReminderRulesClient";

function mapIconKind(linked: NonNullable<ReminderRule["linkedObjectType"]>): PersonalReminderRowVM["iconKind"] {
  switch (linked) {
    case "lfk_complex":
      return "lfk";
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
  rule: ReminderRule,
  complexTitleById: Record<string, string>,
): Promise<string> {
  const lo = rule.linkedObjectType;
  const id = rule.linkedObjectId;
  if (!lo) return "";
  if (lo === "lfk_complex") {
    return (id && complexTitleById[id]) || "Комплекс ЛФК";
  }
  if (lo === "content_section") {
    if (id === "warmups") return "Разминки";
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
  return "Напоминание";
}

export default async function RemindersPage() {
  const session = await requirePatientAccess(routePaths.patientReminders);
  const deps = buildAppDeps();
  const userId = session.user.userId;

  const [rules, projectionStats, complexes] = await Promise.all([
    deps.reminders.listRulesByUser(userId),
    deps.reminderProjection.getStats(userId, 30),
    deps.diaries.listLfkComplexes(userId),
  ]);

  const journalStats = deps.reminderJournal
    ? await deps.reminderJournal.statsPerRuleForUser(userId, 30)
    : {};

  const personalRules = rules.filter((r) => r.linkedObjectType != null);
  personalRules.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));

  const legacyRules = rules.filter((r) => r.linkedObjectType == null);

  const complexTitleById = Object.fromEntries(
    complexes.map((c) => [c.id, c.title?.trim() || "—"]),
  );

  const personalRows: PersonalReminderRowVM[] = [];
  for (const r of personalRules) {
    const label = await resolvePersonalReminderLabel(deps, r, complexTitleById);
    const iconKind = mapIconKind(r.linkedObjectType!);
    const st = journalStats[r.id] ?? { done: 0, skipped: 0, snoozed: 0 };
    personalRows.push({ rule: r, label, iconKind, stats: st });
  }

  return (
    <AppShell
      title="Напоминания"
      user={session.user}
      backHref={routePaths.patient}
      backLabel="Меню"
      variant="patient"
    >
      <p className="mb-4 text-sm text-muted-foreground">
        Свои напоминания (ЛФК, разминки, текст) и категории от врача. Изменения синхронизируются с ботом.
      </p>

      {projectionStats.total > 0 && (
        <Card className="mb-4">
          <CardContent className="pb-4 pt-4">
            <p className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Уведомления за 30 дней
            </p>
            <div className="flex flex-wrap gap-4 text-sm">
              <span>
                <span className="font-medium">{projectionStats.total}</span>{" "}
                <span className="text-muted-foreground">отправлено</span>
              </span>
              <span>
                <span className="font-medium">{projectionStats.seen}</span>{" "}
                <span className="text-muted-foreground">просмотрено</span>
              </span>
              <span>
                <span className="font-medium">{projectionStats.unseen}</span>{" "}
                <span className="text-muted-foreground">пропущено</span>
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      <ReminderRulesClient
        personalRows={personalRows}
        legacyRules={legacyRules}
        unseenCount={projectionStats.unseen}
      />
    </AppShell>
  );
}
