"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ContentEngagementStatsResponse } from "@/app-layer/stats/loadAdminReminderStats";

const PRESETS = [
  { hours: 168, label: "7 дн." },
  { hours: 720, label: "30 дн." },
] as const;

const STROKE_SENT = "hsl(215 65% 42%)";
const STROKE_FAILED = "hsl(0 72% 48%)";
const FILL_SENT = "hsl(215 55% 52% / 0.85)";
const FILL_FAILED = "hsl(0 65% 52% / 0.85)";
const FILL_PRACTICE = "hsl(142 45% 42% / 0.9)";
const FILL_WARMUP_VIDEO = "hsl(215 55% 48% / 0.9)";
const STROKE_PUSH_OPEN = "hsl(142 50% 38%)";
const FILL_PUSH_OPEN = "hsl(142 45% 42% / 0.85)";
const FILL_PUSH_SENT = "hsl(215 55% 52% / 0.85)";

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

function chartHeightForRows(rowCount: number): number {
  return Math.min(360, 80 + rowCount * 28);
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
          <Tooltip />
          <Bar dataKey="count" name={barName} fill={fill} radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function shortUtcDay(bucket: string): string {
  const s = bucket.trim();
  if (s.length >= 10) return s.slice(0, 10);
  return s;
}

function shortUtcHour(bucket: string): string {
  const s = bucket.trim().replace("T", " ");
  return s.length >= 16 ? s.slice(0, 16) : s;
}

function formatPushOpenRate(rate: number): string {
  if (!Number.isFinite(rate) || rate <= 0) return "0%";
  return `${(rate * 100).toFixed(1)}%`;
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

  const dailyChartData = useMemo(
    () =>
      (data?.occurrenceHistoryDaily ?? []).map((r) => ({
        ...r,
        day: shortUtcDay(r.bucket),
      })),
    [data?.occurrenceHistoryDaily],
  );

  const hourlyChartData = useMemo(
    () =>
      (data?.occurrenceHistoryHourly ?? []).map((r) => ({
        ...r,
        hour: shortUtcHour(r.bucket),
      })),
    [data?.occurrenceHistoryHourly],
  );

  const practiceChartData = useMemo(
    () => topPagesToChartData(data?.practiceTopPages ?? []),
    [data?.practiceTopPages],
  );

  const warmupVideoChartData = useMemo(
    () => topPagesToChartData(data?.warmupVideoTopPages ?? []),
    [data?.warmupVideoTopPages],
  );

  const pushDailyChartData = useMemo(
    () =>
      (data?.pushOpensDaily ?? []).map((r) => ({
        ...r,
        day: shortUtcDay(r.bucket),
      })),
    [data?.pushOpensDaily],
  );

  const pushHourlyChartData = useMemo(
    () =>
      (data?.pushOpensHourly ?? []).map((r) => ({
        ...r,
        hour: shortUtcHour(r.bucket),
      })),
    [data?.pushOpensHourly],
  );

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Платформа за выбранный период (не фильтр по вашим пациентам). Часы и сутки — UTC.
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
        <>
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">Напоминания: отправки по суткам (UTC)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[240px] w-full min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dailyChartData} margin={{ top: 8, right: 8, left: 4, bottom: 48 }}>
                    <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" />
                    <XAxis
                      dataKey="day"
                      tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                      interval={0}
                      angle={-35}
                      textAnchor="end"
                      height={60}
                    />
                    <YAxis
                      width={36}
                      tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                      allowDecimals={false}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        fontSize: 12,
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="sent" name="Отправлено" stackId="o" fill={FILL_SENT} />
                    <Bar dataKey="failed" name="Ошибка" stackId="o" fill={FILL_FAILED} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">Напоминания: отправки по часам (UTC)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[260px] w-full min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={hourlyChartData} margin={{ top: 8, right: 12, left: 4, bottom: 8 }}>
                    <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" />
                    <XAxis
                      dataKey="hour"
                      tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                      interval="preserveStartEnd"
                      minTickGap={24}
                    />
                    <YAxis
                      width={36}
                      tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                      allowDecimals={false}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        fontSize: 12,
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line type="monotone" dataKey="sent" name="Отправлено" stroke={STROKE_SENT} dot={false} strokeWidth={2} />
                    <Line
                      type="monotone"
                      dataKey="failed"
                      name="Ошибка"
                      stroke={STROKE_FAILED}
                      dot={false}
                      strokeWidth={2}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">Открытия push</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-6 text-sm tabular-nums">
                <span>
                  Открытий: <strong>{data.pushOpensSummary.opened}</strong>
                </span>
                <span>
                  Отправлено: <strong>{data.pushOpensSummary.sent}</strong>
                </span>
                <span>
                  Доля открытий: <strong>{formatPushOpenRate(data.pushOpensSummary.openRate)}</strong>
                </span>
              </div>
              <div className="h-[200px] w-full min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={pushDailyChartData} margin={{ top: 8, right: 8, left: 4, bottom: 48 }}>
                    <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" />
                    <XAxis
                      dataKey="day"
                      tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                      interval={0}
                      angle={-35}
                      textAnchor="end"
                      height={60}
                    />
                    <YAxis width={36} allowDecimals={false} tick={{ fontSize: 10 }} />
                    <Tooltip
                      contentStyle={{
                        background: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        fontSize: 12,
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="sent" name="Отправлено" fill={FILL_PUSH_SENT} />
                    <Bar dataKey="opened" name="Открыто" fill={FILL_PUSH_OPEN} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="h-[200px] w-full min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={pushHourlyChartData} margin={{ top: 8, right: 12, left: 4, bottom: 8 }}>
                    <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" />
                    <XAxis
                      dataKey="hour"
                      tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                      interval="preserveStartEnd"
                      minTickGap={24}
                    />
                    <YAxis width={36} allowDecimals={false} tick={{ fontSize: 10 }} />
                    <Tooltip
                      contentStyle={{
                        background: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        fontSize: 12,
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line
                      type="monotone"
                      dataKey="opened"
                      name="Открыто"
                      stroke={STROKE_PUSH_OPEN}
                      dot={false}
                      strokeWidth={2}
                    />
                    <Line
                      type="monotone"
                      dataKey="sent"
                      name="Отправлено"
                      stroke={STROKE_SENT}
                      dot={false}
                      strokeWidth={2}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-sm">Завершения практики по страницам (топ)</CardTitle>
              </CardHeader>
              <CardContent>
                <TopPagesHorizontalBarChart data={practiceChartData} barName="Завершений" fill={FILL_PRACTICE} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-sm">Открытия видео разминок по страницам (топ)</CardTitle>
              </CardHeader>
              <CardContent>
                <TopPagesHorizontalBarChart data={warmupVideoChartData} barName="Просмотров" fill={FILL_WARMUP_VIDEO} />
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">Видео: платформа</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs text-muted-foreground">
              <p>
                Выдача ссылок (окно): всего {data.videoPlayback.totalResolutions}, HLS {data.videoPlayback.byDelivery.hls}{" "}
                / MP4 {data.videoPlayback.byDelivery.mp4} / файл {data.videoPlayback.byDelivery.file}, fallback{" "}
                {data.videoPlayback.fallbackTotal}. Уникальных пар (первый просмотр в окне):{" "}
                {data.videoPlayback.uniquePlaybackPairsFirstSeenInWindow}.
              </p>
              <p>
                Ошибки клиента плеера (окно): {data.videoPlaybackClient.totalErrors}, за 1 ч UTC:{" "}
                {data.videoPlaybackClient.totalErrorsLast1h}
                {data.videoPlaybackClient.likelyLooping ? " · признак цикла (hls_fatal)" : ""}.
              </p>
              <p>
                При выключенной выдаче видео в настройках счётчики могут быть нулевыми — это не показатель интереса к
                контенту.
              </p>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
