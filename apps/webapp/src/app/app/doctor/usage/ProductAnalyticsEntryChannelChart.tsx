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

import type { ProductAnalyticsEntryChannelHourlyRow } from "@/modules/product-analytics/types";
import { formatDisplayZoneHourFromBucket } from "@/shared/datetime/displayTimeZoneFormat";

const STROKE = {
  pwa: "hsl(142 55% 36%)",
  telegram: "hsl(210 70% 45%)",
  max: "hsl(280 55% 48%)",
  browser: "hsl(25 75% 45%)",
} as const;

function formatBucketTick(bucket: string): string {
  const hour = formatDisplayZoneHourFromBucket(bucket);
  const day = bucket.trim().slice(0, 10).replace(/-/g, ".").slice(5);
  if (day.length >= 5) return `${day} ${hour}`;
  return hour;
}

export function ProductAnalyticsEntryChannelChart({
  rows,
}: {
  rows: ProductAnalyticsEntryChannelHourlyRow[];
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">Нет данных</p>;
  }

  const data = rows.map((r) => ({
    bucket: r.bucket,
    pwa: r.pwa,
    telegram: r.telegram,
    max: r.max,
    browser: r.browser,
  }));

  const yMax = Math.max(1, ...data.flatMap((r) => [r.pwa, r.telegram, r.max, r.browser]));

  return (
    <div className="h-[260px] w-full min-w-0 pb-2">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 48 }}>
          <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" />
          <XAxis
            dataKey="bucket"
            tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
            tickLine={false}
            interval="preserveStartEnd"
            tickFormatter={formatBucketTick}
          />
          <YAxis
            domain={[0, yMax]}
            width={36}
            allowDecimals={false}
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            tickLine={false}
          />
          <Tooltip
            labelFormatter={(bucket) => formatBucketTick(String(bucket))}
            contentStyle={{
              background: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "6px",
            }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line type="monotone" dataKey="pwa" name="PWA" stroke={STROKE.pwa} strokeWidth={2} dot={false} />
          <Line
            type="monotone"
            dataKey="telegram"
            name="Telegram"
            stroke={STROKE.telegram}
            strokeWidth={2}
            dot={false}
          />
          <Line type="monotone" dataKey="max" name="MAX" stroke={STROKE.max} strokeWidth={2} dot={false} />
          <Line
            type="monotone"
            dataKey="browser"
            name="Браузер"
            stroke={STROKE.browser}
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
