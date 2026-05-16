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

import type { MaterialRatingDoctorDetailDay } from "@/modules/material-rating/types";

const STROKE_VIEWS = "hsl(215 65% 38%)";
const STROKE_ACTIVITY = "hsl(28 78% 42%)";
const STROKE_AVG = "hsl(142 55% 36%)";

function chartPeriodForPointCount(n: number): StatsPeriod {
  if (n <= 7) return "week";
  if (n <= 31) return "month";
  return "all";
}

export function MaterialRatingDetailChart({ days }: { days: MaterialRatingDoctorDetailDay[] }) {
  const period = chartPeriodForPointCount(days.length);
  const data = days.map((p) => ({
    full: p.day,
    views: p.viewCount,
    ratingActivity: p.ratingActivityCount,
    avgStars: p.avgStarsInActivity,
  }));

  const countMax = Math.max(
    1,
    ...days.flatMap((s) => [s.viewCount, s.ratingActivityCount]),
  );

  return (
    <div className="h-[280px] w-full min-w-0 pb-2">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 36, left: 4, bottom: 48 }}>
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
            yAxisId="left"
            domain={[0, countMax]}
            width={40}
            allowDecimals={false}
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            tickLine={false}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            domain={[0, 5]}
            width={36}
            allowDecimals
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            tickLine={false}
          />
          <Tooltip
            formatter={(value, name) => {
              const v = typeof value === "number" ? value : Number(value);
              const ok = Number.isFinite(v);
              const label =
                name === "views"
                  ? "Просмотры видео"
                  : name === "ratingActivity"
                    ? "Оценок (изменений)"
                    : "Средняя за день";
              if (name === "avgStars") {
                return [`${ok ? v.toFixed(2) : "—"}`, label];
              }
              return [`${ok ? v : "—"}`, label];
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
            formatter={(value) =>
              value === "views"
                ? "Просмотры видео"
                : value === "ratingActivity"
                  ? "Оценок (изменений)"
                  : "Средняя за день"
            }
          />
          <Line
            yAxisId="left"
            type="monotone"
            name="views"
            dataKey="views"
            stroke={STROKE_VIEWS}
            strokeWidth={2}
            dot={{ r: 3, fill: STROKE_VIEWS, strokeWidth: 0 }}
            activeDot={{ r: 4 }}
            isAnimationActive={false}
          />
          <Line
            yAxisId="left"
            type="monotone"
            name="ratingActivity"
            dataKey="ratingActivity"
            stroke={STROKE_ACTIVITY}
            strokeWidth={2}
            dot={{ r: 3, fill: STROKE_ACTIVITY, strokeWidth: 0 }}
            activeDot={{ r: 4 }}
            isAnimationActive={false}
          />
          <Line
            yAxisId="right"
            type="monotone"
            name="avgStars"
            dataKey="avgStars"
            stroke={STROKE_AVG}
            strokeWidth={2}
            connectNulls
            dot={{ r: 3, fill: STROKE_AVG, strokeWidth: 0 }}
            activeDot={{ r: 4 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
