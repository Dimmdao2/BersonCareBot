"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import type { ProductAnalyticsTopPageRow } from "@/modules/product-analytics/types";
import { DoctorRechartsTooltip } from "@/shared/ui/doctor/DoctorRechartsTooltip";

const FILL_VIEWS = "hsl(215 55% 52% / 0.9)";
const FILL_UNIQUE = "hsl(142 45% 42% / 0.9)";

function chartHeightForRows(rowCount: number): number {
  return Math.min(420, 100 + rowCount * 30);
}

function shortenPageKey(pageKey: string): string {
  return pageKey.length > 48 ? `${pageKey.slice(0, 45)}...` : pageKey;
}

export function ProductAnalyticsTopPagesChart({ rows }: { rows: ProductAnalyticsTopPageRow[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">Нет данных</p>;
  }

  const data = rows.map((r) => ({
    pageKey: shortenPageKey(r.pageKey),
    views: r.views,
    uniqueUsers: r.uniqueUsers,
  }));

  const height = chartHeightForRows(data.length);
  return (
    <div className="w-full min-w-0" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart layout="vertical" data={data} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
          <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" />
          <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} />
          <YAxis
            type="category"
            dataKey="pageKey"
            width={184}
            tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
          />
          <DoctorRechartsTooltip />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="views" name="Просмотры" fill={FILL_VIEWS} radius={[0, 4, 4, 0]} />
          <Bar dataKey="uniqueUsers" name="Клиенты" fill={FILL_UNIQUE} radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
