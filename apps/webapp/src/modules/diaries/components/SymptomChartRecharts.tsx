"use client";

import DiaryLineChartRecharts, { type DiaryLineChartPoint } from "./DiaryLineChartRecharts";
import type { StatsPeriod } from "@/modules/diaries/stats/periodWindow";

export type SymptomChartPoint = DiaryLineChartPoint;

export default function SymptomChartRecharts({
  points,
  period,
}: {
  points: SymptomChartPoint[];
  period: StatsPeriod;
}) {
  return (
    <DiaryLineChartRecharts
      points={points}
      period={period}
      valueTooltipLabel="Интенсивность"
    />
  );
}
