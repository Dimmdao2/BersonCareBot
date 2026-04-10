import Link from "next/link";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requirePatientAccessWithPhone } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";
import { AppShell } from "@/shared/ui/AppShell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

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
        <p className="text-sm text-muted-foreground">Журнал недоступен в этой среде.</p>
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
      <p className="mb-4 text-sm text-muted-foreground">
        События за всё время по выбранному правилу (отметки из бота и приложения).
      </p>

      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">Записей пока нет.</p>
      ) : (
        <ul className="m-0 list-none space-y-2 p-0">
          {entries.map((e) => (
            <li key={e.id}>
              <Card>
                <CardContent className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">{ACTION_LABEL[e.action] ?? e.action}</Badge>
                    <time className="text-xs text-muted-foreground" dateTime={e.createdAt}>
                      {new Date(e.createdAt).toLocaleString("ru-RU")}
                    </time>
                  </div>
                  {e.skipReason ? (
                    <p className="w-full text-xs text-muted-foreground">Причина: {e.skipReason}</p>
                  ) : null}
                  {e.snoozeUntil ? (
                    <p className="w-full text-xs text-muted-foreground">
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
        <Link href={routePaths.patientReminders} className="text-sm text-primary underline">
          К списку напоминаний
        </Link>
      </p>
    </AppShell>
  );
}
