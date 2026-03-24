import { MiniStatsChart } from "./MiniStatsChart";
import type { MiniStatsChartProps } from "./miniStatsTypes";

export type MiniStatsProps =
  | { variant: "guest" }
  | { variant: "no_phone" }
  | { variant: "empty"; message?: string }
  | ({ variant: "data" } & MiniStatsChartProps);

/**
 * Мини-статистика на главной: sparkline симптомов + кружки ЛФК (recharts только в клиентском чанке).
 */
export function MiniStats(props: MiniStatsProps) {
  if (props.variant === "guest") {
    return (
      <div className="relative overflow-hidden rounded-lg border border-dashed p-4">
        <div className="bg-muted/30 pointer-events-none absolute inset-0 opacity-60">
          <div className="from-primary/20 absolute bottom-0 left-0 right-0 top-1/3 bg-gradient-to-t to-transparent" />
        </div>
        <p className="text-muted-foreground relative text-sm">
          Статистика доступна зарегистрированным пользователям при ведении дневника.
        </p>
      </div>
    );
  }
  if (props.variant === "no_phone") {
    return (
      <div className="relative overflow-hidden rounded-lg border border-dashed p-4">
        <div className="bg-muted/30 pointer-events-none absolute inset-0 opacity-50">
          <div className="from-primary/15 absolute bottom-0 left-0 right-0 top-1/3 bg-gradient-to-t to-transparent" />
        </div>
        <p className="text-muted-foreground relative text-sm">
          Статистика доступна зарегистрированным пользователям при ведении дневника. Привяжите номер телефона в
          профиле.
        </p>
      </div>
    );
  }
  if (props.variant === "empty") {
    return (
      <p className="text-muted-foreground text-sm">{props.message ?? "Нет данных дневника за последний месяц."}</p>
    );
  }
  if (props.variant === "data") {
    return (
      <MiniStatsChart
        points={props.points}
        lfkDays={props.lfkDays}
        statsLinkHref={props.statsLinkHref}
      />
    );
  }
  return null;
}
