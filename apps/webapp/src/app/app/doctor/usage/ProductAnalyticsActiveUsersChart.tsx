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

import type { ProductAnalyticsActiveUsersDailyRow } from "@/modules/product-analytics/types";

const STROKE = "hsl(215 65% 38%)";

export function ProductAnalyticsActiveUsersChart({
  rows,
}: {
  rows: ProductAnalyticsActiveUsersDailyRow[];
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">Нет данных</p>;
  }

  const data = rows.map((r) => ({ day: r.day, activeUsers: r.activeUsers }));
  const yMax = Math.max(1, ...data.map((r) => r.activeUsers));

  return (
    <div className="h-[220px] w-full min-w-0 pb-2">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 32 }}>
          <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" />
          <XAxis
            dataKey="day"
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            domain={[0, yMax]}
            width={36}
            allowDecimals={false}
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            tickLine={false}
          />
          <Tooltip
            formatter={(value) => [typeof value === "number" ? value : "—", "Активные"]}
            contentStyle={{
              background: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "6px",
            }}
          />
          <Line
            type="monotone"
            dataKey="activeUsers"
            stroke={STROKE}
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
