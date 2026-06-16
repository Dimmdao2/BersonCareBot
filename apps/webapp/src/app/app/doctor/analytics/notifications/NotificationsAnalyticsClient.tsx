"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
import { MetricAccountsDialog } from "@/app/app/doctor/analytics/clients/MetricAccountsDialog";
import type { DoctorAnalyticsMetricKey } from "@/modules/doctor-analytics-metric-accounts/ports";
import { PeopleWithNotificationsCard } from "@/app/app/doctor/analytics/shared/PeopleWithNotificationsCard";
import { PushOpensAnalyticsCard } from "@/app/app/doctor/analytics/shared/PushOpensAnalyticsCard";
import { ReminderSendsHourlyClockChart } from "@/app/app/doctor/analytics/shared/ReminderSendsHourlyClockChart";

const PRESETS = DOCTOR_ANALYTICS_WINDOW_HOUR_PRESETS;

function formatPct(rate: number): string {
  if (!Number.isFinite(rate) || rate <= 0) return "0%";
  return `${(rate * 100).toFixed(1)}%`;
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
      const res = await fetch(`/api/doctor/content-stats?windowHours=${hours}`, { credentials: "include" });
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
            period={{ preset: "week", customFrom: "", customTo: "" }}
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
          </div>
        </>
      ) : null}
    </div>
  );
}
