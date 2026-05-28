"use client";

import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ReminderPeopleWithNotificationsStats } from "@/app-layer/stats/reminderNotificationPeopleStats";
import { reminderPeopleChannelSegmentColor } from "@/app-layer/stats/reminderNotificationPeopleStats";
import {
  formatDisplayZoneDayRuFromBucket,
  formatDisplayZoneDayShortFromBucket,
} from "@/shared/datetime/displayTimeZoneFormat";

const CHART_H = 160;

export function PeopleWithNotificationsCard({
  stats,
}: {
  stats: ReminderPeopleWithNotificationsStats;
}) {
  const dailyChartData = useMemo(
    () =>
      stats.daily.map((r) => ({
        ...r,
        dayLabel: formatDisplayZoneDayShortFromBucket(r.bucket),
        dayRu: formatDisplayZoneDayRuFromBucket(r.bucket),
      })),
    [stats.daily],
  );

  const pieSlices = useMemo(
    () =>
      stats.channelSegmentsToday.map((s) => ({
        name: s.label,
        value: s.peopleCount,
        segment: s.segment,
      })),
    [stats.channelSegmentsToday],
  );

  return (
    <Card className="md:col-span-2">
      <CardHeader className="py-2">
        <CardTitle className="text-sm">Люди с уведомлениями</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="min-w-0">
            <p className="mb-1 text-[10px] text-muted-foreground">
              Сейчас:{" "}
              <span className="font-semibold text-foreground tabular-nums">{stats.currentPeopleCount}</span>
            </p>
            {dailyChartData.length === 0 ? (
              <p className="text-xs text-muted-foreground">Нет данных за период.</p>
            ) : (
              <div className="w-full min-w-0" style={{ height: CHART_H }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dailyChartData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                    <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="dayLabel" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                    <YAxis allowDecimals={false} tick={{ fontSize: 10 }} width={28} />
                    <Tooltip
                      labelFormatter={(_, payload) => {
                        const row = payload?.[0]?.payload as { dayRu?: string } | undefined;
                        return row?.dayRu ?? "";
                      }}
                      formatter={(v) => [`${v} чел.`, "Люди"]}
                      contentStyle={{
                        background: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        fontSize: 11,
                      }}
                    />
                    <Bar dataKey="peopleCount" name="Люди" fill="hsl(215 55% 48% / 0.9)" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div className="min-w-0">
            {pieSlices.length === 0 ? (
              <p className="text-xs text-muted-foreground">Нет людей с включёнными напоминаниями.</p>
            ) : (
              <div className="flex items-center gap-3">
                <div className="h-[88px] w-[88px] shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieSlices}
                        cx="50%"
                        cy="50%"
                        innerRadius={24}
                        outerRadius={40}
                        paddingAngle={2}
                        dataKey="value"
                      >
                        {pieSlices.map((s) => (
                          <Cell key={s.segment} fill={reminderPeopleChannelSegmentColor(s.segment)} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(v, _n, item) => {
                          const row = item?.payload as { name?: string } | undefined;
                          return [`${v} чел.`, row?.name ?? ""];
                        }}
                        contentStyle={{
                          background: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          fontSize: 11,
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <ul className="space-y-1 text-xs">
                  {pieSlices.map((s) => (
                    <li key={s.segment} className="flex items-center gap-2">
                      <span
                        className="inline-block h-2 w-2 rounded-sm"
                        style={{ background: reminderPeopleChannelSegmentColor(s.segment) }}
                      />
                      <span className="text-muted-foreground">{s.name}</span>
                      <span className="font-semibold tabular-nums">{s.value}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
