"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/doctor/primitives/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/doctor/primitives/select";
import type { ContentEngagementStatsResponse } from "@/app-layer/stats/loadAdminReminderStats";
import { DoctorStatCard } from "@/app/app/doctor/analytics/clients/DoctorStatCard";
import { MetricAccountsDialog } from "@/app/app/doctor/analytics/clients/MetricAccountsDialog";
import type { DoctorAnalyticsMetricKey } from "@/modules/doctor-analytics-metric-accounts/ports";
import { PeopleWithNotificationsCard } from "@/app/app/doctor/analytics/shared/PeopleWithNotificationsCard";
import { PushOpensAnalyticsCard } from "@/app/app/doctor/analytics/shared/PushOpensAnalyticsCard";
import { ReminderSendsHourlyClockChart } from "@/app/app/doctor/analytics/shared/ReminderSendsHourlyClockChart";
import { DoctorRechartsTooltip } from "@/shared/ui/doctor/DoctorRechartsTooltip";

const PRESETS = [
  { hours: 24, label: "24 ч" },
  { hours: 168, label: "7 дн." },
  { hours: 720, label: "30 дн." },
] as const;

const FILL_PRACTICE = "hsl(142 45% 42% / 0.9)";
const FILL_WARMUP_VIDEO = "hsl(215 55% 48% / 0.9)";

const VIDEO_DELIVERY_COLORS: Record<string, string> = {
  HLS: "hsl(215 60% 52%)",
  MP4: "hsl(38 75% 52%)",
  FILE: "hsl(142 45% 48%)",
};

type TopPageRow = { section: string; slug: string; count: number };

function chartHeightForRows(rowCount: number): number {
  return Math.min(200, 72 + rowCount * 24);
}

function formatPct(rate: number): string {
  if (!Number.isFinite(rate) || rate <= 0) return "0%";
  return `${(rate * 100).toFixed(1)}%`;
}

function topPagesToChartData(rows: TopPageRow[]) {
  return rows.map((r) => {
    const full = `${r.section}/${r.slug}`;
    return {
      label: full.length > 44 ? `${full.slice(0, 41)}...` : full,
      count: r.count,
    };
  });
}

function TopPagesHorizontalBarChart({
  data,
  barName,
  fill,
}: {
  data: Array<{ label: string; count: number }>;
  barName: string;
  fill: string;
}) {
  if (data.length === 0) {
    return <p className="text-sm text-muted-foreground">Нет данных за период.</p>;
  }
  const height = chartHeightForRows(data.length);
  return (
    <div className="w-full min-w-0" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart layout="vertical" data={data} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
          <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" />
          <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} />
          <YAxis
            type="category"
            dataKey="label"
            width={168}
            tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
          />
          <DoctorRechartsTooltip />
          <Bar dataKey="count" name={barName} fill={fill} radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function VideoDeliveryPie({ hls, mp4, file }: { hls: number; mp4: number; file: number }) {
  const slices = [
    { name: "HLS", value: hls },
    { name: "MP4", value: mp4 },
    { name: "FILE", value: file },
  ].filter((s) => s.value > 0);

  if (slices.length === 0) {
    return <p className="text-xs text-muted-foreground">Нет данных.</p>;
  }

  return (
    <div className="flex items-center gap-3">
      <div className="h-[88px] w-[88px] shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={slices}
              cx="50%"
              cy="50%"
              innerRadius={24}
              outerRadius={40}
              paddingAngle={2}
              dataKey="value"
            >
              {slices.map((s) => (
                <Cell key={s.name} fill={VIDEO_DELIVERY_COLORS[s.name] ?? "hsl(var(--muted-foreground))"} />
              ))}
            </Pie>
            <DoctorRechartsTooltip
              formatter={(v) => [String(v), ""]}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="space-y-1 text-xs">
        {slices.map((s) => (
          <li key={s.name} className="flex items-center gap-2">
            <span
              className="inline-block h-2 w-2 rounded-sm"
              style={{ background: VIDEO_DELIVERY_COLORS[s.name] }}
            />
            <span className="text-muted-foreground">{s.name}</span>
            <span className="font-semibold tabular-nums">{s.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

type MetricDialogState = { metric: DoctorAnalyticsMetricKey; title: string } | null;

export function NotificationsAnalyticsClient() {
  const [windowHours, setWindowHours] = useState<number>(168);
  const [data, setData] = useState<ContentEngagementStatsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [metricDialog, setMetricDialog] = useState<MetricDialogState>(null);

  const load = useCallback(async (hours: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/reminder-stats?windowHours=${hours}`, { credentials: "include" });
      if (!res.ok) {
        setError(res.status === 403 ? "Доступ запрещён" : `Ошибка ${res.status}`);
        setData(null);
        return;
      }
      const json = (await res.json()) as ContentEngagementStatsResponse;
      setData(json);
    } catch {
      setError("Не удалось загрузить");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(windowHours);
  }, [load, windowHours]);

  const presetLabel = PRESETS.find((p) => p.hours === windowHours)?.label ?? String(windowHours);

  const practiceChartData = useMemo(
    () => topPagesToChartData(data?.practiceTopPages ?? []),
    [data?.practiceTopPages],
  );

  const warmupVideoChartData = useMemo(
    () => topPagesToChartData(data?.warmupVideoTopPages ?? []),
    [data?.warmupVideoTopPages],
  );

  const remindersSentTotal = useMemo(
    () => (data?.occurrenceHistoryDaily ?? []).reduce((acc, row) => acc + row.sent, 0),
    [data?.occurrenceHistoryDaily],
  );

  const remindersFailedTotal = useMemo(
    () => (data?.occurrenceHistoryDaily ?? []).reduce((acc, row) => acc + row.failed, 0),
    [data?.occurrenceHistoryDaily],
  );

  const remindersFailRate = remindersSentTotal > 0 ? (remindersFailedTotal / remindersSentTotal) * 100 : 0;
  const openRatePct = data ? Number((data.pushOpensSummary.openRate * 100).toFixed(1)) : 0;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <Select
          value={String(windowHours)}
          onValueChange={(v) => {
            if (v == null || v === "") return;
            const n = Number.parseInt(v, 10);
            if (Number.isFinite(n)) setWindowHours(n);
          }}
        >
          <SelectTrigger className="w-[140px]" displayLabel={presetLabel}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PRESETS.map((p) => (
              <SelectItem key={p.hours} value={String(p.hours)}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {loading ? <span className="text-xs text-muted-foreground">Загрузка…</span> : null}
        {error ? <span className="text-xs text-destructive">{error}</span> : null}
      </div>

      {data ? (
        <>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
            <DoctorStatCard
              id="notif-sent-total"
              title="Отправлено"
              value={remindersSentTotal}
              onClick={() => setMetricDialog({ metric: "notif_reminders_sent", title: "Отправлено" })}
            />
            <DoctorStatCard
              id="notif-failed-total"
              title="Ошибок"
              value={remindersFailedTotal}
              tone={remindersFailedTotal > 0 ? "warning" : "neutral"}
              hint={remindersSentTotal > 0 ? `Доля: ${formatPct(remindersFailRate / 100)}` : "Нет отправок"}
              onClick={() => setMetricDialog({ metric: "notif_reminders_failed", title: "Ошибки отправки" })}
            />
            <DoctorStatCard
              id="notif-open-rate"
              title="Push open rate"
              value={openRatePct}
              hint={`Открыто: ${data.pushOpensSummary.opened} из ${data.pushOpensSummary.sent}`}
              onClick={() => setMetricDialog({ metric: "notif_push_opened", title: "Push open" })}
            />
          </div>

          <MetricAccountsDialog
            open={metricDialog !== null}
            onOpenChange={(open) => {
              if (!open) setMetricDialog(null);
            }}
            metric={metricDialog?.metric ?? null}
            title={metricDialog?.title ?? ""}
            period={{ preset: "week" }}
            extraQuery={{ windowHours: String(windowHours) }}
          />

          <div className="grid gap-3 md:grid-cols-2">
            <PeopleWithNotificationsCard stats={data.peopleWithNotifications} />

            <Card className="h-full">
              <CardHeader className="py-2">
                <CardTitle className="text-sm">Напоминания: отправки по часам, 24 ч</CardTitle>
              </CardHeader>
              <CardContent>
                <ReminderSendsHourlyClockChart slices={data.reminderSendsLast24hClock} />
              </CardContent>
            </Card>

            <PushOpensAnalyticsCard data={data} variant="2" />

            <Card className="h-full">
              <CardHeader className="py-2">
                <CardTitle className="text-sm">Завершения практики по страницам (топ)</CardTitle>
              </CardHeader>
              <CardContent>
                <TopPagesHorizontalBarChart data={practiceChartData} barName="Завершений" fill={FILL_PRACTICE} />
              </CardContent>
            </Card>

            <Card className="h-full">
              <CardHeader className="py-2">
                <CardTitle className="text-sm">Открытия видео разминок по страницам (топ)</CardTitle>
              </CardHeader>
              <CardContent>
                <TopPagesHorizontalBarChart data={warmupVideoChartData} barName="Просмотров" fill={FILL_WARMUP_VIDEO} />
              </CardContent>
            </Card>

            <Card className="h-full md:col-span-2">
              <CardHeader className="py-2">
                <CardTitle className="text-sm">Видео: формат доставки и ошибки</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <VideoDeliveryPie
                  hls={data.videoPlayback.byDelivery.hls}
                  mp4={data.videoPlayback.byDelivery.mp4}
                  file={data.videoPlayback.byDelivery.file}
                />
                <p className="text-xs text-muted-foreground">
                  Ошибок клиента за период: {data.videoPlaybackClient.totalErrors}, за последний час:{" "}
                  {data.videoPlaybackClient.totalErrorsLast1h}
                  {data.videoPlaybackClient.likelyLooping ? ", есть признак цикла (hls_fatal)." : "."}
                </p>
              </CardContent>
            </Card>
          </div>
        </>
      ) : null}
    </div>
  );
}
