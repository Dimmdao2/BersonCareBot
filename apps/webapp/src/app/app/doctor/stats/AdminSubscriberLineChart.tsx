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

import type { AdminSubscriberDayPoint } from "@/modules/admin-platform-stats/types";

const STROKE = "hsl(142 55% 36%)";

function chartPeriodForPointCount(n: number): StatsPeriod {
  if (n <= 7) return "week";
  if (n <= 31) return "month";
  return "all";
}

export function AdminSubscriberLineChart({ series }: { series: AdminSubscriberDayPoint[] }) {
  const period = chartPeriodForPointCount(series.length);
  const data = series.map((p) => ({
    full: p.day,
    cumulativeSubscribers: p.cumulativeSubscribers,
  }));
  const maxVal = Math.max(1, ...series.map((s) => s.cumulativeSubscribers));

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
            domain={[0, maxVal]}
            width={36}
            allowDecimals={false}
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            tickLine={false}
          />
          <Tooltip
            formatter={(value) => {
              const v = typeof value === "number" ? value : Number(value);
              return [`${Number.isFinite(v) ? v : "—"}`, "Подписчики"];
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
            formatter={() => "Подписчики"}
          />
          <Line
            type="monotone"
            name="cumulativeSubscribers"
            dataKey="cumulativeSubscribers"
            stroke={STROKE}
            strokeWidth={2}
            dot={{ r: 3, fill: STROKE, strokeWidth: 0 }}
            activeDot={{ r: 4 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
