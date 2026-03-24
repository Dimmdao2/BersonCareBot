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

export type SymptomChartPoint = { date: string; value: number };

export default function SymptomChartRecharts({ points }: { points: SymptomChartPoint[] }) {
  const data = points.map((p) => ({ name: p.date.slice(5), value: p.value, full: p.date }));
  return (
    <div className="h-[220px] w-full min-w-0">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            tickLine={false}
            label={{ value: "Дата (ММ-ДД)", position: "insideBottom", offset: -2, fontSize: 10 }}
          />
          <YAxis
            domain={[0, 10]}
            width={28}
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            tickLine={false}
            label={{ value: "0–10", angle: -90, position: "insideLeft", fontSize: 10 }}
          />
          <Tooltip
            formatter={(value) => {
              const v = typeof value === "number" ? value : Number(value);
              return [`${Number.isFinite(v) ? v : "—"}/10`, "Интенсивность"];
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
            stroke="hsl(var(--primary))"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
