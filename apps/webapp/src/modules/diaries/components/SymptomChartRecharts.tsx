"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { StatsPeriod } from "@/modules/diaries/stats/periodWindow";
import { diaryChartFormatTickLabel, diaryChartShowTick } from "@/modules/diaries/stats/formatDiaryChartTick";

export type SymptomChartPoint = {
  date: string;
  instant: number | null;
  daily: number | null;
};

const STROKE_INSTANT = "hsl(215 65% 38%)";
const STROKE_DAILY = "hsl(28 78% 42%)";

export default function SymptomChartRecharts({
  points,
  period,
}: {
  points: SymptomChartPoint[];
  period: StatsPeriod;
}) {
  const data = points.map((p) => ({
    full: p.date,
    instant: p.instant,
    daily: p.daily,
  }));

  return (
    <div className="h-[260px] w-full min-w-0 pb-2">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 48 }}>
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
            formatter={(value, name) => {
              if (value == null || value === "") return [null, null];
              const v = typeof value === "number" ? value : Number(value);
              const label = name === "instant" ? "В моменте" : "За день";
              return [`${Number.isFinite(v) ? v : "—"}/10`, label];
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
          <Legend
            verticalAlign="bottom"
            wrapperStyle={{ paddingTop: 8 }}
            formatter={(value) => (value === "instant" ? "В моменте" : "За день")}
          />
          <Line
            type="monotone"
            name="instant"
            dataKey="instant"
            stroke={STROKE_INSTANT}
            strokeWidth={3}
            dot={{ r: 4, fill: STROKE_INSTANT, strokeWidth: 0 }}
            activeDot={{ r: 5 }}
            isAnimationActive={false}
            connectNulls={false}
          />
          <Line
            type="monotone"
            name="daily"
            dataKey="daily"
            stroke={STROKE_DAILY}
            strokeWidth={3}
            dot={{ r: 4, fill: STROKE_DAILY, strokeWidth: 0 }}
            activeDot={{ r: 5 }}
            isAnimationActive={false}
            connectNulls={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
