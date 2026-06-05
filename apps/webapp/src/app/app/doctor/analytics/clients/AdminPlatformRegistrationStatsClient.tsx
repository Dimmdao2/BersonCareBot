"use client";

import { useCallback, useEffect, useState } from "react";

import type { AdminRegistrationStatsPayload } from "@/modules/admin-platform-stats/types";
import type { DoctorAnalyticsMetricKey } from "@/modules/doctor-analytics-metric-accounts/ports";
import { DoctorSection, DoctorSectionTitle } from "@/shared/ui/doctor/DoctorSection";
import { DoctorMetricList } from "@/shared/ui/doctor/DoctorMetricList";

import { AdminRegistrationLineChart } from "./AdminRegistrationLineChart";
import { buildAdminStatsQuery, type AnalyticsPeriodValue } from "./analyticsPeriodUi";
import { DoctorStatCard } from "./DoctorStatCard";

function formatRegistrationError(code: string): string {
  if (code === "range_too_short") return "Период не короче 7 дней.";
  return code;
}

type Props = {
  period: AnalyticsPeriodValue;
  ready: boolean;
  onMetricClick?: (metric: DoctorAnalyticsMetricKey, title: string) => void;
};

export function AdminPlatformRegistrationStatsClient({ period, ready, onMetricClick }: Props) {
  const [data, setData] = useState<AdminRegistrationStatsPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const q = buildAdminStatsQuery(period);
      const res = await fetch(`/api/admin/platform-user-registration-stats?${q}`, { cache: "no-store" });
      const json = (await res.json()) as { ok?: boolean; error?: string } & Partial<AdminRegistrationStatsPayload>;
      if (!res.ok || !json.ok) {
        setData(null);
        setError(formatRegistrationError(json.error ?? `HTTP ${res.status}`));
        return;
      }
      const { ok: _ok, ...rest } = json as { ok: true } & AdminRegistrationStatsPayload;
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
    <DoctorSection id="doctor-stats-admin-registrations-section" className="min-w-0">
      <DoctorSectionTitle>Регистрации и слияния</DoctorSectionTitle>

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
          <DoctorMetricList id="doctor-stats-admin-registration-cards" className="xl:grid-cols-3 2xl:grid-cols-3">
            <DoctorStatCard
              id="doctor-stats-admin-registrations"
              title="Регистрации"
              value={data.summary.registrations}
              onClick={
                onMetricClick
                  ? () => onMetricClick("registrations", "Регистрации за период")
                  : undefined
              }
            />
            {data.summary.merges > 0 ? (
              <DoctorStatCard
                id="doctor-stats-admin-merges"
                title="Слияния"
                value={data.summary.merges}
                tone="warning"
                onClick={
                  onMetricClick ? () => onMetricClick("registrations_merges", "Слияния за период") : undefined
                }
              />
            ) : null}
            <DoctorStatCard
              id="doctor-stats-admin-registration-combined"
              title="Всего событий"
              value={data.summary.combined}
              onClick={
                onMetricClick ? () => onMetricClick("registrations_combined", "Все события за период") : undefined
              }
            />
          </DoctorMetricList>
          {data.series.length > 0 ? <AdminRegistrationLineChart series={data.series} /> : null}
        </>
      ) : null}
    </DoctorSection>
  );
}
