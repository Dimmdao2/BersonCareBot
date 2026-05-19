import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { patientCardClass, patientMutedTextClass } from "@/shared/ui/patientVisual";

type ProjectionStats = {
  total: number;
  seen: number;
  unseen: number;
};

/** Статистика доставки напоминаний — в самом низу страницы расписания. */
export function RemindersPageThirtyDayStats({ projectionStats }: { projectionStats: ProjectionStats }) {
  return (
    <section aria-labelledby="reminders-thirty-day-stats-heading" className="mt-8">
      <Card className={patientCardClass}>
        <CardContent className="pb-4 pt-4">
          <p
            id="reminders-thirty-day-stats-heading"
            className={cn(patientMutedTextClass, "mb-2 text-xs font-semibold uppercase tracking-wide")}
          >
            Уведомления за 30 дней
          </p>
          <p className={cn(patientMutedTextClass, "mb-3 text-xs")}>По напоминаниям из бота и приложения.</p>
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
    </section>
  );
}
