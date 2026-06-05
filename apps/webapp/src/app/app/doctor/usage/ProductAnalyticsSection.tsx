"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { UsageMetricAccountsDialog } from "./UsageMetricAccountsDialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/doctor/primitives/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/shared/ui/doctor/primitives/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/doctor/primitives/select";
import { DoctorStatCard } from "@/app/app/doctor/analytics/clients/DoctorStatCard";
import { PRODUCT_ANALYTICS_PUSH_TOPIC_HINT } from "@/modules/product-analytics/productAnalyticsTopicLabels";
import type { ProductAnalyticsAdminDashboard } from "@/modules/product-analytics/types";
import { formatDisplayZoneInstantRu } from "@/shared/datetime/displayTimeZoneFormat";
import { ProductAnalyticsActiveUsersChart } from "./ProductAnalyticsActiveUsersChart";
import { ProductAnalyticsEntryChannelChart } from "./ProductAnalyticsEntryChannelChart";
import { ProductAnalyticsPushByTopicChart } from "./ProductAnalyticsPushByTopicChart";
import { ProductAnalyticsTopPagesChart } from "./ProductAnalyticsTopPagesChart";

const PRESETS = [
  { hours: 24, label: "24 ч" },
  { hours: 168, label: "7 дн." },
  { hours: 720, label: "30 дн." },
] as const;

const CHANNEL_LABEL: Record<string, string> = {
  pwa: "PWA",
  telegram: "Telegram",
  max: "MAX",
  browser: "Браузер",
};

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
  const [showAllClients, setShowAllClients] = useState(false);
  const [clientsDialogOpen, setClientsDialogOpen] = useState(false);

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
  const pushOpenRatePct = data ? Math.round(data.summary.pushOpenRate * 100) : 0;
  const sortedClientRows = useMemo(
    () =>
      (data?.clientActivity ?? [])
        .slice()
        .sort((a, b) => b.totalActivity - a.totalActivity || b.pageViews - a.pageViews),
    [data?.clientActivity],
  );
  const topClientRows = sortedClientRows.slice(0, 10);
  const extraClientRows = sortedClientRows.slice(10);
  const channelTotalsText =
    data?.entryChannelTotals
      .map((row) => `${CHANNEL_LABEL[row.entryChannel] ?? row.entryChannel}: ${row.appOpens}`)
      .join(" · ") ?? "—";

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
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <DoctorStatCard
              id="usage-kpi-active-users"
              title="Активных клиентов"
              value={data.summary.uniqueActiveUsers}
              onClick={() => setClientsDialogOpen(true)}
            />
            <DoctorStatCard id="usage-kpi-app-opens" title="Заходы" value={data.summary.totalAppOpens} />
            <DoctorStatCard
              id="usage-kpi-page-views"
              title="Просмотры страниц"
              value={data.summary.totalPageViews}
            />
            <DoctorStatCard
              id="usage-kpi-active-minutes"
              title="Минуты активности"
              value={data.summary.totalActiveMinutes}
            />
            <DoctorStatCard
              id="usage-kpi-push-sent"
              title="Push отправлено"
              value={data.summary.totalPushSent}
            />
            <DoctorStatCard
              id="usage-kpi-push-open-rate"
              title="Push open rate"
              value={pushOpenRatePct}
              hint={`Открыто: ${data.summary.totalPushOpens}`}
            />
          </div>

          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">Активные клиенты по суткам</CardTitle>
            </CardHeader>
            <CardContent>
              <ProductAnalyticsActiveUsersChart rows={data.activeUsersDaily} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">Заходы по каналу</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <ProductAnalyticsEntryChannelChart rows={data.entryChannelHourly} />
              <p className="text-xs text-muted-foreground">{channelTotalsText}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">Топ страниц</CardTitle>
            </CardHeader>
            <CardContent>
              <ProductAnalyticsTopPagesChart rows={data.topPages} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">Push по темам уведомлений</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <ProductAnalyticsPushByTopicChart rows={data.pushByTopic} />
              <p className="text-xs text-muted-foreground">{PRODUCT_ANALYTICS_PUSH_TOPIC_HINT}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">Слоганы разминки</CardTitle>
            </CardHeader>
            <CardContent>
              <Collapsible defaultOpen={false}>
                <CollapsibleTrigger className="text-xs text-primary underline underline-offset-2">
                  Слоганы разминки ({data.warmupSlogans.length})
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-3">
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
                </CollapsibleContent>
              </Collapsible>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">Клиенты</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <StatTable
                columns={[
                  { key: "displayName", header: "Клиент" },
                  { key: "lastSeenAt", header: "Последний визит" },
                  { key: "appOpens", header: "Заходы" },
                  { key: "pageViews", header: "Страницы" },
                  { key: "pushOpens", header: "Push open" },
                  { key: "activeMinutes", header: "Минуты" },
                  { key: "channels", header: "Каналы" },
                ]}
                rows={topClientRows.map((r) => ({
                  displayName: r.displayName,
                  lastSeenAt: formatDisplayZoneInstantRu(r.lastSeenAt, data.displayTimezone),
                  appOpens: r.appOpens,
                  pageViews: r.pageViews,
                  pushOpens: r.pushOpens,
                  activeMinutes: r.activeMinutes,
                  channels:
                    r.channels
                      .map((c) => `${CHANNEL_LABEL[c.entryChannel] ?? c.entryChannel}: ${c.totalActivity}`)
                      .join(", ") || "—",
                }))}
              />
              {extraClientRows.length > 0 ? (
                <Collapsible open={showAllClients} onOpenChange={setShowAllClients}>
                  <CollapsibleTrigger className="text-xs text-primary underline underline-offset-2">
                    {showAllClients ? "Скрыть" : `Показать всех (${sortedClientRows.length})`}
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pt-3">
                    <StatTable
                      columns={[
                        { key: "displayName", header: "Клиент" },
                        { key: "lastSeenAt", header: "Последний визит" },
                        { key: "appOpens", header: "Заходы" },
                        { key: "pageViews", header: "Страницы" },
                        { key: "pushOpens", header: "Push open" },
                        { key: "activeMinutes", header: "Минуты" },
                        { key: "channels", header: "Каналы" },
                      ]}
                      rows={extraClientRows.map((r) => ({
                        displayName: r.displayName,
                        lastSeenAt: formatDisplayZoneInstantRu(r.lastSeenAt, data.displayTimezone),
                        appOpens: r.appOpens,
                        pageViews: r.pageViews,
                        pushOpens: r.pushOpens,
                        activeMinutes: r.activeMinutes,
                        channels:
                          r.channels
                            .map((c) => `${CHANNEL_LABEL[c.entryChannel] ?? c.entryChannel}: ${c.totalActivity}`)
                            .join(", ") || "—",
                      }))}
                    />
                  </CollapsibleContent>
                </Collapsible>
              ) : null}
            </CardContent>
          </Card>
          <UsageMetricAccountsDialog
            open={clientsDialogOpen}
            onOpenChange={setClientsDialogOpen}
            title="Активные клиенты"
            rows={sortedClientRows}
            displayTimezone={data.displayTimezone}
          />
        </>
      ) : null}
    </div>
  );
}
