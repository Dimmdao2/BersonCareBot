"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
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
import { DOCTOR_ANALYTICS_WINDOW_HOUR_PRESETS } from "@/app/app/doctor/analytics/shared/analyticsWindowHourPresets";
import type { ContentEngagementStatsResponse } from "@/app-layer/stats/loadAdminReminderStats";
import { DoctorStatCard } from "@/app/app/doctor/analytics/clients/DoctorStatCard";
import { DoctorRechartsTooltip } from "@/shared/ui/doctor/DoctorRechartsTooltip";

const PRESETS = DOCTOR_ANALYTICS_WINDOW_HOUR_PRESETS;

const FILL_PRACTICE = "hsl(142 45% 42% / 0.9)";
const FILL_WARMUP_VIDEO = "hsl(215 55% 48% / 0.9)";
const FILL_EXERCISE_VIDEO = "hsl(280 45% 50% / 0.9)";

const VIDEO_DELIVERY_COLORS: Record<string, string> = {
  HLS: "hsl(215 60% 52%)",
  MP4: "hsl(38 75% 52%)",
  Файл: "hsl(142 45% 48%)",
};

const CHART_H_ROWS = 200;

type TopPageRow = { section: string; slug: string; count: number };

function topPagesToChartData(rows: TopPageRow[]) {
  return rows.map((r) => {
    const full = `${r.section}/${r.slug}`;
    return {
      label: full.length > 44 ? `${full.slice(0, 41)}…` : full,
      count: r.count,
    };
  });
}

function exerciseVideoToChartData(rows: Array<{ title: string; count: number }>) {
  return rows.map((r) => ({
    label: r.title.length > 44 ? `${r.title.slice(0, 41)}…` : r.title,
    count: r.count,
  }));
}

function chartHeightForRows(rowCount: number): number {
  return Math.min(CHART_H_ROWS, 72 + rowCount * 24);
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
    { name: "Файл", value: file },
  ].filter((s) => s.value > 0);

  if (slices.length === 0) {
    return <p className="text-xs text-muted-foreground">Нет данных.</p>;
  }

  return (
    <div className="flex items-center gap-4">
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

export function MaterialContentStatsClient() {
  const [windowHours, setWindowHours] = useState<number>(168);
  const [data, setData] = useState<ContentEngagementStatsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (hours: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/doctor/content-stats?windowHours=${hours}`, {
        credentials: "include",
      });
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

  const exerciseVideoChartData = useMemo(
    () => exerciseVideoToChartData(data?.exerciseVideoTopItems ?? []),
    [data?.exerciseVideoTopItems],
  );

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Платформа за выбранный период (не фильтр по вашим пациентам).
      </p>
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
        <div className="grid gap-3 md:grid-cols-2">
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
            <CardContent className="space-y-3">
              <DoctorStatCard
                id="content-stats-warmup-watch-minutes"
                title="Минут просмотра"
                value={data.warmupVideoEstimatedWatchMinutes}
                hint="оценка по длительности роликов"
              />
              <TopPagesHorizontalBarChart data={warmupVideoChartData} barName="Просмотров" fill={FILL_WARMUP_VIDEO} />
            </CardContent>
          </Card>

          <Card className="md:col-span-2">
            <CardHeader className="py-2">
              <CardTitle className="text-sm">Открытия видео упражнений из программ (топ)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <DoctorStatCard
                id="content-stats-exercise-video-count"
                title="Всего открытий"
                value={data.exerciseVideoCount}
                hint="за период"
              />
              <TopPagesHorizontalBarChart
                data={exerciseVideoChartData}
                barName="Открытий"
                fill={FILL_EXERCISE_VIDEO}
              />
            </CardContent>
          </Card>

          <Card className="md:col-span-2">
            <CardHeader className="py-2">
              <CardTitle className="text-sm">Видео: платформа</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-5">
                <DoctorStatCard
                  id="content-stats-video-resolutions"
                  title="Выдач всего"
                  value={data.videoPlayback.totalResolutions}
                  hint="за период"
                  href="/app/doctor/system-health"
                />
                <DoctorStatCard
                  id="content-stats-video-watch-minutes"
                  title="Минут просмотра"
                  value={data.videoPlaybackEstimatedWatchMinutes}
                  hint="оценка по длительности роликов"
                  href="/app/doctor/system-health"
                />
                <DoctorStatCard
                  id="content-stats-video-pairs"
                  title="Уникальных пар"
                  value={data.videoPlayback.uniquePlaybackPairsFirstSeenInWindow}
                  hint="пользователь + видео"
                  href="/app/doctor/system-health"
                />
                <DoctorStatCard
                  id="content-stats-video-fallback"
                  title="Fallback на MP4"
                  value={data.videoPlayback.fallbackTotal}
                  hint={data.videoPlayback.fallbackTotal > 0 ? "HLS → MP4" : "не потребовался"}
                  href="/app/doctor/system-health"
                />
                <DoctorStatCard
                  id="content-stats-video-errors"
                  title="Ошибок плеера"
                  value={data.videoPlaybackClient.totalErrors}
                  tone={data.videoPlaybackClient.totalErrors > 0 ? "warning" : "neutral"}
                  hint={
                    data.videoPlaybackClient.likelyLooping
                      ? "признак цикла hls_fatal"
                      : data.videoPlaybackClient.totalErrorsLast1h > 0
                        ? `за 1 ч: ${data.videoPlaybackClient.totalErrorsLast1h}`
                        : "за 1 ч: 0"
                  }
                  href="/app/doctor/system-health"
                />
              </div>

              {data.videoPlayback.totalResolutions > 0 ? (
                <div>
                  <p className="mb-2 text-xs font-medium text-muted-foreground">Формат доставки</p>
                  <VideoDeliveryPie
                    hls={data.videoPlayback.byDelivery.hls}
                    mp4={data.videoPlayback.byDelivery.mp4}
                    file={data.videoPlayback.byDelivery.file}
                  />
                </div>
              ) : null}

              <p className="text-xs text-muted-foreground">
                При выключенной выдаче видео в настройках счётчики могут быть нулевыми — это не показатель интереса к
                контенту.
              </p>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
