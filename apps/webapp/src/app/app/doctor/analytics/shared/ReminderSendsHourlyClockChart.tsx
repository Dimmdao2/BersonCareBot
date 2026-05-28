"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { HourlyClockSlice } from "@/app-layer/stats/reminderHourlyClock";

const CHART_SIZE = 168;

function sliceFill(sent: number, maxSent: number): string {
  if (sent <= 0) return "hsl(var(--muted) / 0.35)";
  const t = maxSent > 0 ? sent / maxSent : 0;
  const lightness = 72 - t * 32;
  return `hsl(215 60% ${lightness}%)`;
}

export function ReminderSendsHourlyClockChart({ slices }: { slices: HourlyClockSlice[] }) {
  const maxSent = Math.max(1, ...slices.map((s) => s.sent));
  const totalSent = slices.reduce((a, s) => a + s.sent, 0);

  if (totalSent === 0) {
    return <p className="text-sm text-muted-foreground">Нет отправок за последние 24 ч.</p>;
  }

  const pieData = slices.map((s) => ({
    ...s,
    value: Math.max(s.sent, 0.001),
  }));

  return (
    <div className="flex flex-col items-center gap-2 sm:flex-row sm:items-start sm:gap-4">
      <div className="relative shrink-0" style={{ width: CHART_SIZE, height: CHART_SIZE }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={pieData}
              cx="50%"
              cy="50%"
              innerRadius={44}
              outerRadius={78}
              paddingAngle={1}
              dataKey="value"
              startAngle={90}
              endAngle={-270}
            >
              {pieData.map((s) => (
                <Cell key={s.hour} fill={sliceFill(s.sent, maxSent)} />
              ))}
            </Pie>
            <Tooltip
              formatter={(_, __, item) => {
                const p = item?.payload as HourlyClockSlice | undefined;
                if (!p) return ["—", ""];
                return [`${p.sent} отправок`, p.label];
              }}
              contentStyle={{
                background: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                fontSize: 11,
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-lg font-semibold tabular-nums leading-none">{totalSent}</span>
          <span className="mt-0.5 text-[10px] text-muted-foreground">за 24 ч</span>
        </div>
      </div>
      <ul className="grid max-h-[168px] grid-cols-4 gap-x-2 gap-y-0.5 overflow-y-auto text-[10px] sm:grid-cols-3">
        {slices
          .filter((s) => s.sent > 0)
          .sort((a, b) => b.sent - a.sent)
          .map((s) => (
            <li key={s.hour} className="tabular-nums text-muted-foreground">
              <span className="font-medium text-foreground">{s.label}</span> {s.sent}
            </li>
          ))}
      </ul>
    </div>
  );
}
