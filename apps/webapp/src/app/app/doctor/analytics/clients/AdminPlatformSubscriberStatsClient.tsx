"use client";

import { useCallback, useEffect, useState } from "react";

import { Button } from "@/shared/ui/doctor/primitives/button";
import type { AdminStatsTimePreset, AdminSubscriberStatsPayload } from "@/modules/admin-platform-stats/types";
import { DoctorSection, DoctorSectionTitle } from "@/shared/ui/doctor/DoctorSection";

import { AdminSubscriberLineChart } from "./AdminSubscriberLineChart";

function buildQuery(preset: AdminStatsTimePreset, from: string, to: string): string {
  const p = new URLSearchParams();
  p.set("preset", preset);
  if (preset === "custom") {
    p.set("from", from);
    p.set("to", to);
  }
  return `/api/admin/platform-user-subscriber-stats?${p.toString()}`;
}

function ymdMinusDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map((x) => Number.parseInt(x, 10));
  const dt = new Date(y!, m! - 1, d!);
  dt.setDate(dt.getDate() - days);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

export function AdminPlatformSubscriberStatsClient({ calendarTodayYmd }: { calendarTodayYmd: string }) {
  const [preset, setPreset] = useState<AdminStatsTimePreset>("month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [data, setData] = useState<AdminSubscriberStatsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const q = buildQuery(preset, customFrom.trim(), customTo.trim());
      const res = await fetch(q, { cache: "no-store" });
      const json = (await res.json()) as { ok?: boolean; error?: string } & Partial<AdminSubscriberStatsPayload>;
      if (!res.ok || !json.ok) {
        setData(null);
        const code = json.error ?? `HTTP ${res.status}`;
        setError(code);
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
  }, [preset, customFrom, customTo]);

  useEffect(() => {
    if (preset === "custom" && (!customFrom.trim() || !customTo.trim())) {
      const t = calendarTodayYmd.trim() || new Date().toISOString().slice(0, 10);
      setCustomFrom(ymdMinusDays(t, 6));
      setCustomTo(t);
      return;
    }
    void load();
  }, [preset, customFrom, customTo, load, calendarTodayYmd]);

  return (
    <DoctorSection
      id="doctor-stats-admin-subscribers-section"
      className="min-w-0"
    >
      <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
        <DoctorSectionTitle>Подписчики</DoctorSectionTitle>
        {data ? <p className="text-muted-foreground text-sm">Календарь: {data.iana}</p> : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant={preset === "week" ? "default" : "outline"}
          onClick={() => setPreset("week")}
        >
          7 дней
        </Button>
        <Button
          type="button"
          size="sm"
          variant={preset === "month" ? "default" : "outline"}
          onClick={() => setPreset("month")}
        >
          30 дней
        </Button>
        <Button
          type="button"
          size="sm"
          variant={preset === "custom" ? "default" : "outline"}
          onClick={() => setPreset("custom")}
        >
          Период
        </Button>
      </div>

      {preset === "custom" ? (
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-sm">
            С
            <input
              className="rounded-md border border-input bg-background px-2 py-1 text-sm"
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            По
            <input
              className="rounded-md border border-input bg-background px-2 py-1 text-sm"
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
            />
          </label>
          <Button type="button" size="sm" onClick={() => void load()}>
            Показать
          </Button>
        </div>
      ) : null}

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
          <p className="text-muted-foreground text-sm">
            {data.fromDay === data.toDay ? `День ${data.fromDay}` : `Период ${data.fromDay} — ${data.toDay}`}
          </p>
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
