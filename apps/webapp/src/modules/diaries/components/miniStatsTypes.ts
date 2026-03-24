import type { LfkDotState } from "../stats/aggregation";

export type { LfkDotState };

export type MiniStatsChartProps = {
  /** Точки симптома 0–10 за период. */
  points: { t: string; v: number }[];
  /** До 7 последних дней ЛФК слева направо (старый → новый). */
  lfkDays: LfkDotState[];
  /** Ссылка на дневник (вся область графика — переход). */
  statsLinkHref?: string;
};
