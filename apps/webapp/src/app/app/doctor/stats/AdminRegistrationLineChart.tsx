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

import type { AdminRegistrationDayPoint } from "@/modules/admin-platform-stats/types";

const STROKE_NEW = "hsl(215 65% 38%)";
const STROKE_MERGE = "hsl(28 78% 42%)";

function chartPeriodForPointCount(n: number): StatsPeriod {
  if (n <= 7) return "week";
  if (n <= 31) return "month";
  return "all";
}

export function AdminRegistrationLineChart({ series }: { series: AdminRegistrationDayPoint[] }) {
  const period = chartPeriodForPointCount(series.length);
  const data = series.map((p) => ({
    full: p.day,
    newUsers: p.newUsers,
    merges: p.merges,
  }));
  const yMax = Math.max(
    1,
    ...series.flatMap((s) => [s.newUsers, s.merges]),
    ...series.map((s) => s.newUsers + s.merges),
  );

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
            domain={[0, yMax]}
            width={36}
            allowDecimals={false}
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            tickLine={false}
          />
          <Tooltip
            formatter={(value, name) => {
              const v = typeof value === "number" ? value : Number(value);
              const label = name === "newUsers" ? "Новые" : "Мержи";
              return [`${Number.isFinite(v) ? v : "—"}`, label];
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
            formatter={(value) => (value === "newUsers" ? "Новые аккаунты" : "Слияния")}
          />
          <Line
            type="monotone"
            name="newUsers"
            dataKey="newUsers"
            stroke={STROKE_NEW}
            strokeWidth={2}
            dot={{ r: 3, fill: STROKE_NEW, strokeWidth: 0 }}
            activeDot={{ r: 4 }}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            name="merges"
            dataKey="merges"
            stroke={STROKE_MERGE}
            strokeWidth={2}
            dot={{ r: 3, fill: STROKE_MERGE, strokeWidth: 0 }}
            activeDot={{ r: 4 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
