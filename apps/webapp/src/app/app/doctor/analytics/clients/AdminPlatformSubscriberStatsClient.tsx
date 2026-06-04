"use client";

import { useCallback, useEffect, useState } from "react";

import type { AdminSubscriberStatsPayload } from "@/modules/admin-platform-stats/types";
import type { DoctorAnalyticsMetricKey } from "@/modules/doctor-analytics-metric-accounts/ports";
import { DoctorMetricList } from "@/shared/ui/doctor/DoctorMetricList";
import { DoctorSection, DoctorSectionTitle } from "@/shared/ui/doctor/DoctorSection";

import { AdminSubscriberLineChart } from "./AdminSubscriberLineChart";
import { buildAdminStatsQuery, type AnalyticsPeriodValue } from "./analyticsPeriodUi";
import { DoctorStatCard } from "./DoctorStatCard";

type Props = {
  period: AnalyticsPeriodValue;
  ready: boolean;
  onMetricClick?: (metric: DoctorAnalyticsMetricKey, title: string) => void;
};

export function AdminPlatformSubscriberStatsClient({ period, ready, onMetricClick }: Props) {
  const [data, setData] = useState<AdminSubscriberStatsPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const q = buildAdminStatsQuery(period);
      const res = await fetch(`/api/admin/platform-user-subscriber-stats?${q}`, { cache: "no-store" });
      const json = (await res.json()) as { ok?: boolean; error?: string } & Partial<AdminSubscriberStatsPayload>;
      if (!res.ok || !json.ok) {
        setData(null);
        setError(json.error ?? `HTTP ${res.status}`);
        return;
      }
      const { ok: _ok, ...rest } = json as { ok: true } & AdminSubscriberStatsPayload;
      setData(rest);
    } catch {
      setData(null);
      setError("network");
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    if (!ready) return;
    void load();
  }, [load, ready]);

  return (
    <DoctorSection id="doctor-stats-admin-subscribers-section" className="min-w-0">
      <DoctorSectionTitle>Подписчики</DoctorSectionTitle>

      {error ? (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}

      {loading && !data ? (
        <p className="text-muted-foreground text-sm" aria-busy="true">
          Загрузка…
        </p>
      ) : null}

      {data ? (
        <>
          <DoctorMetricList id="doctor-stats-admin-subscriber-cards" className="xl:grid-cols-2 2xl:grid-cols-2">
            <DoctorStatCard
              id="doctor-stats-admin-subscribers-total"
              title="На конец периода"
              value={data.summary.cumulativeEnd}
              onValueClick={
                onMetricClick ? () => onMetricClick("subscribers_total", "Подписчики на конец периода") : undefined
              }
            />
            <DoctorStatCard
              id="doctor-stats-admin-subscribers-delta"
              title="Прирост за период"
              value={data.summary.deltaInRange}
              onValueClick={
                onMetricClick ? () => onMetricClick("subscribers_delta", "Новые подписчики за период") : undefined
              }
            />
          </DoctorMetricList>
          {data.series.length > 0 ? <AdminSubscriberLineChart series={data.series} /> : null}
        </>
      ) : null}
    </DoctorSection>
  );
}
