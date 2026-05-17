"use client";

import { useCallback, useEffect, useState } from "react";
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
  { hours: 24, label: "24 ч" },
  { hours: 168, label: "7 дн." },
  { hours: 720, label: "30 дн." },
] as const;

function StatTable({
  rows,
  columns,
}: {
  rows: Array<Record<string, string | number>>;
  columns: Array<{ key: string; header: string }>;
}) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">Нет данных</p>;
  return (
    <div className="overflow-x-auto rounded border border-border/50">
      <table className="w-full min-w-[320px] border-collapse text-left text-xs">
        <thead>
          <tr className="border-b border-border/60 bg-muted/30">
            {columns.map((c) => (
              <th key={c.key} className="px-2 py-1.5 font-medium">
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-border/40 last:border-0">
              {columns.map((c) => (
                <td key={c.key} className="px-2 py-1.5 font-mono">
                  {row[c.key] ?? "—"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ReminderStatsSection() {
  const [windowHours, setWindowHours] = useState<number>(168);
  const [data, setData] = useState<ContentEngagementStatsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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

  return (
    <div className="space-y-4">
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
          <p className="text-xs text-muted-foreground tabular-nums">
            Включено правил напоминаний (в системе): {data.reminderRulesEnabledCount}
          </p>
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">События напоминаний по часам (UTC)</CardTitle>
            </CardHeader>
            <CardContent>
              <StatTable
                columns={[
                  { key: "bucket", header: "Час" },
                  { key: "sent", header: "sent" },
                  { key: "failed", header: "failed" },
                ]}
                rows={data.occurrenceHistoryHourly.map((r) => ({
                  bucket: r.bucket,
                  sent: r.sent,
                  failed: r.failed,
                }))}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">События напоминаний по суткам (UTC)</CardTitle>
            </CardHeader>
            <CardContent>
              <StatTable
                columns={[
                  { key: "bucket", header: "Сутки" },
                  { key: "sent", header: "sent" },
                  { key: "failed", header: "failed" },
                ]}
                rows={data.occurrenceHistoryDaily.map((r) => ({
                  bucket: r.bucket,
                  sent: r.sent,
                  failed: r.failed,
                }))}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">Журнал реакций</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <StatTable
                columns={[
                  { key: "k", header: "Действие" },
                  { key: "v", header: "Кол-во" },
                ]}
                rows={[
                  { k: "done", v: data.journalByAction.done },
                  { k: "skipped", v: data.journalByAction.skipped },
                  { k: "snoozed", v: data.journalByAction.snoozed },
                ]}
              />
              <p className="text-xs font-medium text-muted-foreground">Пропуски: причины (топ)</p>
              <StatTable
                columns={[
                  { key: "reason", header: "Причина" },
                  { key: "count", header: "Кол-во" },
                ]}
                rows={data.journalSkipReasonsTop.map((r) => ({ reason: r.reason, count: r.count }))}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">Завершения материалов</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <StatTable
                columns={[
                  { key: "source", header: "Источник" },
                  { key: "n", header: "Кол-во" },
                ]}
                rows={Object.entries(data.practiceBySource).map(([source, n]) => ({ source, n }))}
              />
              <p className="text-xs font-medium text-muted-foreground">Страницы (топ)</p>
              <StatTable
                columns={[
                  { key: "section", header: "Раздел" },
                  { key: "slug", header: "slug" },
                  { key: "count", header: "Кол-во" },
                ]}
                rows={data.practiceTopPages.map((r) => ({
                  section: r.section,
                  slug: r.slug,
                  count: r.count,
                }))}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">Видео (просмотры по типу доставки)</CardTitle>
            </CardHeader>
            <CardContent>
              <StatTable
                columns={[
                  { key: "k", header: "Тип" },
                  { key: "v", header: "Разрешений" },
                ]}
                rows={[
                  { k: "hls", v: data.videoPlayback.byDelivery.hls },
                  { k: "mp4", v: data.videoPlayback.byDelivery.mp4 },
                  { k: "file", v: data.videoPlayback.byDelivery.file },
                ]}
              />
              <p className="mt-2 text-xs text-muted-foreground">
                Всего разрешений: {data.videoPlayback.totalResolutions}, fallback:{" "}
                {data.videoPlayback.fallbackTotal}, уникальных пар (первый просмотр в окне):{" "}
                {data.videoPlayback.uniquePlaybackPairsFirstSeenInWindow}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">Видео: ошибки клиента</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <StatTable
                columns={[
                  { key: "ev", header: "Класс" },
                  { key: "n", header: "Окно" },
                  { key: "n1h", header: "1 ч" },
                ]}
                rows={(
                  [
                    "hls_fatal",
                    "video_error",
                    "hls_import_failed",
                    "playback_refetch_failed",
                    "playback_refetch_exception",
                    "hls_js_unsupported",
                  ] as const
                ).map((ev) => ({
                  ev,
                  n: data.videoPlaybackClient.byEvent[ev],
                  n1h: data.videoPlaybackClient.byEventLast1h[ev],
                }))}
              />
              <p className="text-xs text-muted-foreground">
                Всего ошибок: {data.videoPlaybackClient.totalErrors}, за 1 ч:{" "}
                {data.videoPlaybackClient.totalErrorsLast1h}
                {data.videoPlaybackClient.likelyLooping ? ", признак цикла (hls_fatal)" : ""}
              </p>
              <StatTable
                columns={[
                  { key: "k", header: "Доставка" },
                  { key: "v", header: "Событий" },
                ]}
                rows={[
                  { k: "hls", v: data.videoPlaybackClient.byDelivery.hls },
                  { k: "mp4", v: data.videoPlaybackClient.byDelivery.mp4 },
                  { k: "file", v: data.videoPlaybackClient.byDelivery.file },
                ]}
              />
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
