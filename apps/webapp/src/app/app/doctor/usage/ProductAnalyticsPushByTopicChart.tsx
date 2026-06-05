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
import type { ProductAnalyticsPushByTopicRow } from "@/modules/product-analytics/types";
import { DoctorRechartsTooltip } from "@/shared/ui/doctor/DoctorRechartsTooltip";

const FILL_SENT = "hsl(215 55% 52% / 0.9)";
const FILL_OPENED = "hsl(142 45% 42% / 0.9)";

function chartHeightForRows(rowCount: number): number {
  return Math.min(420, 100 + rowCount * 30);
}

export function ProductAnalyticsPushByTopicChart({ rows }: { rows: ProductAnalyticsPushByTopicRow[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">Нет данных</p>;
  }

  const data = rows.map((r) => ({
    topicLabel: r.topicLabel,
    sent: r.sent,
    opened: r.opened,
    openRatePct: r.openRate * 100,
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
            dataKey="topicLabel"
            width={200}
            tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
          />
          <DoctorRechartsTooltip
            formatter={(value, name, item) => {
              if (name === "Open rate") {
                return [`${Number(value).toFixed(1)}%`, "Open rate"];
              }
              const payload = item?.payload as { openRatePct?: number } | undefined;
              const suffix =
                payload?.openRatePct != null && Number.isFinite(payload.openRatePct)
                  ? ` (OR ${payload.openRatePct.toFixed(1)}%)`
                  : "";
              return [`${value}${suffix}`, name];
            }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="sent" name="Отправлено" fill={FILL_SENT} radius={[0, 4, 4, 0]} />
          <Bar dataKey="opened" name="Открыто" fill={FILL_OPENED} radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
