"use client";

import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/doctor/primitives/card";
import type { ContentEngagementStatsResponse } from "@/app-layer/stats/loadAdminReminderStats";
import {
  formatDisplayZoneDayShortFromBucket,
  formatDisplayZoneHourFromBucket,
} from "@/shared/datetime/displayTimeZoneFormat";

const STROKE_SENT = "hsl(215 65% 42%)";
const STROKE_PUSH_OPEN = "hsl(142 50% 38%)";
const FILL_PUSH_OPEN = "hsl(142 45% 42% / 0.85)";
const FILL_PUSH_SENT = "hsl(215 55% 52% / 0.85)";

const CHART_H = 160;

function formatPushOpenRate(rate: number): string {
  if (!Number.isFinite(rate) || rate <= 0) return "0%";
  return `${(rate * 100).toFixed(1)}%`;
}

function KpiMini({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent?: "blue" | "green" | "muted";
}) {
  const border =
    accent === "blue"
      ? "border-l-4 border-l-blue-500/70"
      : accent === "green"
        ? "border-l-4 border-l-emerald-500/70"
        : "";
  return (
    <div className={`rounded-md border border-border/60 bg-card px-3 py-2 ${border}`}>
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold tabular-nums leading-tight">{value}</p>
    </div>
  );
}

export function PushOpensAnalyticsCard({
  data,
  variant,
}: {
  data: ContentEngagementStatsResponse;
  variant: "1" | "2";
}) {
  const pushDailyChartData = useMemo(
    () =>
      data.pushOpensDaily.map((r) => ({
        ...r,
        day: formatDisplayZoneDayShortFromBucket(r.bucket),
      })),
    [data.pushOpensDaily],
  );

  const pushHourlyChartData = useMemo(
    () =>
      data.pushOpensHourly.map((r) => ({
        ...r,
        hour: formatDisplayZoneHourFromBucket(r.bucket),
      })),
    [data.pushOpensHourly],
  );

  const showHourlyLine = variant === "1";

  return (
    <Card className="h-full">
      <CardHeader className="py-2">
        <CardTitle className="text-sm">
          Открытия push <span className="text-muted-foreground font-normal">(вар {variant})</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-3 gap-2">
          <KpiMini label="Отправлено" value={data.pushOpensSummary.sent} accent="blue" />
          <KpiMini label="Открыто" value={data.pushOpensSummary.opened} accent="green" />
          <KpiMini
            label="Open rate"
            value={formatPushOpenRate(data.pushOpensSummary.openRate)}
            accent={data.pushOpensSummary.openRate >= 0.1 ? "green" : "muted"}
          />
        </div>
        <div className="w-full min-w-0" style={{ height: CHART_H }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={pushDailyChartData} margin={{ top: 4, right: 4, left: 0, bottom: 40 }}>
              <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" />
              <XAxis
                dataKey="day"
                tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                interval="preserveStartEnd"
                angle={-30}
                textAnchor="end"
                height={44}
              />
              <YAxis width={28} allowDecimals={false} tick={{ fontSize: 9 }} />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  fontSize: 11,
                }}
              />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Bar dataKey="sent" name="Отправлено" fill={FILL_PUSH_SENT} />
              <Bar dataKey="opened" name="Открыто" fill={FILL_PUSH_OPEN} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        {showHourlyLine ? (
          <div className="w-full min-w-0" style={{ height: CHART_H }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={pushHourlyChartData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" />
                <XAxis
                  dataKey="hour"
                  tick={{ fontSize: 8, fill: "hsl(var(--muted-foreground))" }}
                  interval="preserveStartEnd"
                  minTickGap={20}
                />
                <YAxis width={28} allowDecimals={false} tick={{ fontSize: 9 }} />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    fontSize: 11,
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Line
                  type="monotone"
                  dataKey="opened"
                  name="Открыто"
                  stroke={STROKE_PUSH_OPEN}
                  dot={false}
                  strokeWidth={2}
                />
                <Line type="monotone" dataKey="sent" name="Отправлено" stroke={STROKE_SENT} dot={false} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
