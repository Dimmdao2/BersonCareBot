"use client";

import { useCallback, useEffect, useState } from "react";

import type { AdminSubscriberStatsPayload } from "@/modules/admin-platform-stats/types";
import { DoctorSection, DoctorSectionTitle } from "@/shared/ui/doctor/DoctorSection";

import { AdminSubscriberLineChart } from "./AdminSubscriberLineChart";
import { buildAdminStatsQuery, type AnalyticsPeriodValue } from "./analyticsPeriodUi";

type Props = {
  period: AnalyticsPeriodValue;
  ready: boolean;
};

export function AdminPlatformSubscriberStatsClient({ period, ready }: Props) {
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
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
              <div className="text-muted-foreground text-xs">На конец периода</div>
              <div className="text-2xl font-semibold tabular-nums">{data.summary.cumulativeEnd}</div>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
              <div className="text-muted-foreground text-xs">Прирост за период</div>
              <div className="text-2xl font-semibold tabular-nums">{data.summary.deltaInRange}</div>
            </div>
          </div>
          {data.series.length > 0 ? <AdminSubscriberLineChart series={data.series} /> : null}
        </>
      ) : null}
    </DoctorSection>
  );
}
