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
import type { ProductAnalyticsAdminDashboard } from "@/modules/product-analytics/types";
import { ProductAnalyticsActiveUsersChart } from "./ProductAnalyticsActiveUsersChart";
import { ProductAnalyticsEntryChannelChart } from "./ProductAnalyticsEntryChannelChart";

const PRESETS = [
  { hours: 24, label: "24 ч" },
  { hours: 168, label: "7 дн." },
  { hours: 720, label: "30 дн." },
] as const;

function formatOpenRate(rate: number): string {
  if (!Number.isFinite(rate) || rate <= 0) return "0%";
  return `${(rate * 100).toFixed(1)}%`;
}

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

export function ProductAnalyticsSection() {
  const [windowHours, setWindowHours] = useState<number>(168);
  const [data, setData] = useState<ProductAnalyticsAdminDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (hours: number) => {
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const res = await fetch(`/api/admin/product-analytics?windowHours=${hours}`, {
        credentials: "include",
      });
      if (!res.ok) {
        setError(res.status === 403 ? "Доступ запрещён" : `Ошибка ${res.status}`);
        setData(null);
        return;
      }
      const json = (await res.json()) as ProductAnalyticsAdminDashboard;
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
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">Сводка</CardTitle>
            </CardHeader>
            <CardContent>
              <StatTable
                columns={[
                  { key: "k", header: "Метрика" },
                  { key: "v", header: "Значение" },
                ]}
                rows={[
                  { k: "Активные клиенты", v: data.summary.uniqueActiveUsers },
                  { k: "Заходы (app_open)", v: data.summary.totalAppOpens },
                  { k: "Просмотры страниц", v: data.summary.totalPageViews },
                  { k: "Открытия push", v: data.summary.totalPushOpens },
                  { k: "Open rate push", v: formatOpenRate(data.summary.pushOpenRate) },
                ]}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">Заходы по каналу (UTC)</CardTitle>
            </CardHeader>
            <CardContent>
              <ProductAnalyticsEntryChannelChart rows={data.entryChannelHourly} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">Страницы</CardTitle>
            </CardHeader>
            <CardContent>
              <StatTable
                columns={[
                  { key: "pageKey", header: "Страница" },
                  { key: "views", header: "Просмотры" },
                  { key: "uniqueUsers", header: "Клиенты" },
                ]}
                rows={data.topPages.map((r) => ({
                  pageKey: r.pageKey,
                  views: r.views,
                  uniqueUsers: r.uniqueUsers,
                }))}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">Push по теме</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <StatTable
                columns={[
                  { key: "topicCode", header: "Тема" },
                  { key: "sent", header: "Отправлено" },
                  { key: "opened", header: "Открыто" },
                  { key: "openRate", header: "Open rate" },
                ]}
                rows={data.pushByTopic.map((r) => ({
                  topicCode: r.topicCode,
                  sent: r.sent,
                  opened: r.opened,
                  openRate: formatOpenRate(r.openRate),
                }))}
              />
              <p className="text-xs font-medium text-muted-foreground">Разминка: слоганы</p>
              <StatTable
                columns={[
                  { key: "sloganKey", header: "Ключ" },
                  { key: "sampleText", header: "Текст" },
                  { key: "sent", header: "Отправлено" },
                  { key: "opened", header: "Открыто" },
                  { key: "openRate", header: "Open rate" },
                ]}
                rows={data.warmupSlogans.map((r) => ({
                  sloganKey: r.sloganKey,
                  sampleText: r.sampleText ?? "—",
                  sent: r.sent,
                  opened: r.opened,
                  openRate: formatOpenRate(r.openRate),
                }))}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">Активные клиенты по суткам (UTC)</CardTitle>
            </CardHeader>
            <CardContent>
              <ProductAnalyticsActiveUsersChart rows={data.activeUsersDaily} />
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
