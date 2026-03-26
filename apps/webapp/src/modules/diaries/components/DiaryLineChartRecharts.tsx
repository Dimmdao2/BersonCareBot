"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { StatsPeriod } from "@/modules/diaries/stats/periodWindow";
import { diaryChartFormatTickLabel, diaryChartShowTick } from "@/modules/diaries/stats/formatDiaryChartTick";

export type DiaryLineChartPoint = { date: string; value: number };

export default function DiaryLineChartRecharts({
  points,
  period,
  valueTooltipLabel = "Значение",
}: {
  points: DiaryLineChartPoint[];
  period: StatsPeriod;
  valueTooltipLabel?: string;
}) {
  const data = points.map((p) => ({ full: p.date, value: p.value }));

  return (
    <div className="h-[240px] w-full min-w-0 pb-8">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 28 }}>
          <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" />
          <XAxis
            dataKey="full"
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            tickLine={false}
            interval={0}
            tickFormatter={(full: string, index: number) => {
              const prev = index > 0 ? data[index - 1]?.full ?? null : null;
              if (!diaryChartShowTick(period, index, data.length, full, prev)) return "";
              return diaryChartFormatTickLabel(full, period);
            }}
          />
          <YAxis
            domain={[0, 10]}
            width={32}
            ticks={[0, 5, 10]}
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            tickLine={false}
            label={{ value: "0–10", angle: -90, position: "insideLeft", fontSize: 10, dx: -4 }}
          />
          <Tooltip
            formatter={(value) => {
              const v = typeof value === "number" ? value : Number(value);
              return [`${Number.isFinite(v) ? v : "—"}/10`, valueTooltipLabel];
            }}
            labelFormatter={(_, payload) => {
              const p = payload?.[0]?.payload as { full?: string } | undefined;
              return p?.full ?? "";
            }}
            contentStyle={{
              background: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "6px",
            }}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke="hsl(215 65% 38%)"
            strokeWidth={3}
            dot={{ r: 4, fill: "hsl(215 65% 38%)", strokeWidth: 0 }}
            activeDot={{ r: 5 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
