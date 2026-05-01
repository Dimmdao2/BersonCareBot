import Link from "next/link";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requirePatientAccessWithPhone } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";
import { AppShell } from "@/shared/ui/AppShell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { patientInlineLinkClass, patientMutedTextClass } from "@/shared/ui/patientVisual";

type Props = { params: Promise<{ ruleId: string }> };

const ACTION_LABEL: Record<string, string> = {
  done: "Выполнено",
  skipped: "Пропущено",
  snoozed: "Отложено",
};

export default async function PatientReminderJournalPage({ params }: Props) {
  const session = await requirePatientAccessWithPhone(routePaths.patientReminders);
  const { ruleId: raw } = await params;
  const ruleId = decodeURIComponent(raw);
  const deps = buildAppDeps();

  if (!deps.reminderJournal) {
    return (
      <AppShell
        title="Журнал"
        user={session.user}
        backHref={routePaths.patientReminders}
        backLabel="Напоминания"
        variant="patient"
      >
        <p className={patientMutedTextClass}>Журнал недоступен в этой среде.</p>
      </AppShell>
    );
  }

  const entries = await deps.reminderJournal.listByRule(ruleId, session.user.userId);

  return (
    <AppShell
      title="Журнал напоминания"
      user={session.user}
      backHref={routePaths.patientReminders}
      backLabel="Напоминания"
      variant="patient"
    >
      <p className={cn(patientMutedTextClass, "mb-4")}>
        События за всё время по выбранному правилу (отметки из бота и приложения).
      </p>

      {entries.length === 0 ? (
        <p className={patientMutedTextClass}>Записей пока нет.</p>
      ) : (
        <ul className="m-0 list-none space-y-2 p-0">
          {entries.map((e) => (
            <li key={e.id}>
              <Card
                className={cn(
                  "rounded-[var(--patient-card-radius-mobile)] border border-[var(--patient-border)] bg-[var(--patient-card-bg)] !py-0 text-[var(--patient-text-primary)] shadow-[var(--patient-shadow-card-mobile)] ring-0 lg:rounded-[var(--patient-card-radius-desktop)] lg:shadow-[var(--patient-shadow-card-desktop)]",
                )}
              >
                <CardContent className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">{ACTION_LABEL[e.action] ?? e.action}</Badge>
                    <time className={cn(patientMutedTextClass, "text-xs")} dateTime={e.createdAt}>
                      {new Date(e.createdAt).toLocaleString("ru-RU")}
                    </time>
                  </div>
                  {e.skipReason ? (
                    <p className={cn(patientMutedTextClass, "w-full text-xs")}>Причина: {e.skipReason}</p>
                  ) : null}
                  {e.snoozeUntil ? (
                    <p className={cn(patientMutedTextClass, "w-full text-xs")}>
                      До: {new Date(e.snoozeUntil).toLocaleString("ru-RU")}
                    </p>
                  ) : null}
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-6 text-center">
        <Link href={routePaths.patientReminders} className={cn(patientInlineLinkClass, "text-sm")}>
          К списку напоминаний
        </Link>
      </p>
    </AppShell>
  );
}
