import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requirePatientAccess } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";
import { AppShell } from "@/shared/ui/AppShell";
import { Card, CardContent } from "@/components/ui/card";
import { ReminderRulesClient } from "./ReminderRulesClient";

export default async function RemindersPage() {
  const session = await requirePatientAccess(routePaths.patientReminders);
  const deps = buildAppDeps();
  const [rules, stats] = await Promise.all([
    deps.reminders.listRulesByUser(session.user.userId),
    deps.reminderProjection.getStats(session.user.userId, 30),
  ]);

  return (
    <AppShell
      title="Напоминания"
      user={session.user}
      backHref={routePaths.patient}
      backLabel="Меню"
      variant="patient"
    >
      <p className="mb-4 text-sm text-muted-foreground">
        Управляйте расписанием напоминаний по категориям. Изменения применяются при следующей
        синхронизации с вашим ботом.
      </p>

      {stats.total > 0 && (
        <Card className="mb-4">
          <CardContent className="pt-4 pb-4">
            <p className="text-sm font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
              За 30 дней
            </p>
            <div className="flex gap-6 text-sm">
              <span>
                <span className="font-medium">{stats.total}</span>{" "}
                <span className="text-muted-foreground">отправлено</span>
              </span>
              <span>
                <span className="font-medium">{stats.seen}</span>{" "}
                <span className="text-muted-foreground">просмотрено</span>
              </span>
              <span>
                <span className="font-medium">{stats.unseen}</span>{" "}
                <span className="text-muted-foreground">пропущено</span>
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      <ReminderRulesClient rules={rules} unseenCount={stats.unseen} />
    </AppShell>
  );
}
