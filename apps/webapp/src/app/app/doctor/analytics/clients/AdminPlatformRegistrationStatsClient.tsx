"use client";

import { useCallback, useEffect, useState } from "react";

import type { AdminRegistrationStatsPayload } from "@/modules/admin-platform-stats/types";
import { DoctorSection, DoctorSectionTitle } from "@/shared/ui/doctor/DoctorSection";

import { AdminRegistrationLineChart } from "./AdminRegistrationLineChart";
import { buildAdminStatsQuery, type AnalyticsPeriodValue } from "./analyticsPeriodUi";

function formatRegistrationError(code: string): string {
  if (code === "range_too_short") return "Период не короче 7 дней.";
  return code;
}

type Props = {
  period: AnalyticsPeriodValue;
  ready: boolean;
};

export function AdminPlatformRegistrationStatsClient({ period, ready }: Props) {
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
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
              <div className="text-muted-foreground text-xs">Регистрации</div>
              <div className="text-2xl font-semibold tabular-nums">{data.summary.registrations}</div>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
              <div className="text-muted-foreground text-xs">Слияния</div>
              <div className="text-2xl font-semibold tabular-nums">{data.summary.merges}</div>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
              <div className="text-muted-foreground text-xs">Всего событий</div>
              <div className="text-2xl font-semibold tabular-nums">{data.summary.combined}</div>
            </div>
          </div>
          {data.series.length > 0 ? <AdminRegistrationLineChart series={data.series} /> : null}
        </>
      ) : null}
    </DoctorSection>
  );
}
